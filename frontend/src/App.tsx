import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./lib/toast";
import Layout from "./components/Layout";
import Admin from "./pages/Admin";
import BookDetail from "./pages/BookDetail";
import Library from "./pages/Library";
import Login from "./pages/Login";
import Review from "./pages/Review";
import Series from "./pages/Series";
import SeriesDetail from "./pages/SeriesDetail";
import Settings from "./pages/Settings";
import UploadPage from "./pages/UploadPage";

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ink-400" />
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<Library />} />
        <Route path="books/:id" element={<BookDetail />} />
        <Route path="series" element={<Series />} />
        <Route path="series/:name" element={<SeriesDetail />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="upload/:id" element={<Review />} />
        <Route path="admin" element={<Admin />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
