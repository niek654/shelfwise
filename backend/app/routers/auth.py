from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import __version__
from ..auth import authenticate, create_access_token, get_current_user, hash_password, verify_password
from ..config import get_settings
from ..db import get_db
from ..models import User
from ..schemas import LoginIn, PasswordChange, RegisterIn, Token, UserOut
from ..services.metadata import PROVIDERS

router = APIRouter(prefix="/api", tags=["auth"])


@router.get("/config")
def public_config(db: Session = Depends(get_db)):
    settings = get_settings()
    has_users = db.scalar(select(func.count(User.id))) > 0
    return {
        "version": __version__,
        "allow_registration": settings.allow_registration or not has_users,
        "needs_setup": not has_users,
        "providers": [{"name": p.name, "label": p.label, "enabled": p.enabled()} for p in PROVIDERS],
        "filename_template": settings.filename_template,
    }


@router.post("/auth/token", response_model=Token, include_in_schema=False)
def token(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate(db, form.username, form.password)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    return Token(access_token=create_access_token(user))


@router.post("/auth/login", response_model=Token)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = authenticate(db, body.username, body.password)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    return Token(access_token=create_access_token(user))


@router.post("/auth/register", response_model=Token, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    first_user = db.scalar(select(func.count(User.id))) == 0
    if not (get_settings().allow_registration or first_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration is disabled")
    if db.scalar(select(User).where((User.username == body.username) | (User.email == body.email))):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username or email already in use")
    # The very first account becomes the administrator.
    user = User(
        username=body.username, email=body.email, hashed_password=hash_password(body.password), is_admin=first_user
    )
    db.add(user)
    db.commit()
    return Token(access_token=create_access_token(user))


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/auth/me/password", status_code=204)
def change_password(body: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.hashed_password = hash_password(body.new_password)
    db.commit()
