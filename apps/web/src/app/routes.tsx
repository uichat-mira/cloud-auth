import { Navigate, type RouteObject } from "react-router-dom";
import { RootLayout } from "@/app/root-layout";
import { useAuthSession } from "@/lib/auth/context";
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
        element: <PortalHome />,
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

function PortalHome() {
  const { status } = useAuthSession();

  if (status === "idle" || status === "restoring") {
    return <p role="status" className="py-12 text-sm text-muted-foreground">正在检查登录状态…</p>;
  }

  return (
    <Navigate
      to={status === "authenticated" || status === "unavailable" ? "/account" : "/login"}
      replace
    />
  );
}
