from app.services import isbn


def test_validation_and_conversion():
    assert isbn.is_valid_isbn13("9780441013593")
    assert isbn.is_valid_isbn10("0441013597")
    assert not isbn.is_valid_isbn13("9780441013594")
    assert isbn.to_isbn13("0-441-01359-7") == "9780441013593"
    assert isbn.to_isbn10("978-0-441-01359-3") == "0441013597"
    assert isbn.to_isbn10("9791032305690") is None  # 979 prefix has no ISBN-10


def test_find_in_text():
    text = "Copyright 2005. ISBN 0-441-01359-7 (pbk) and ISBN-13: 978-0-441-01359-3. Phone 1234567890."
    assert isbn.find_isbns(text) == ["9780441013593"]
