import { Navigate, type RouteObject } from "react-router-dom";
import { RootLayout } from "@/app/root-layout";
import { AccountPage } from "@/pages/account-page";
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { RouteErrorPage } from "@/pages/route-error-page";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        element: <Navigate to="/login" replace />,
      },
      {
        path: "login",
        element: <LoginPage />,
      },
      {
        path: "account",
        element: <AccountPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
];
