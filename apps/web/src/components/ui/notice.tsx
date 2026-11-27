import * as React from "react";
import { cn } from "@/lib/utils";

export type NoticeTone = "success" | "danger" | "warning" | "info" | "neutral";

const toneClass: Record<NoticeTone, string> = {
  success: "cloud-notice-success",
  danger: "cloud-notice-danger",
  warning: "cloud-notice-warning",
  info: "cloud-notice-info",
  neutral: "cloud-notice-neutral",
};

interface NoticeProps extends Omit<React.ComponentProps<"p">, "role"> {
  tone?: NoticeTone;
  /**
   * Success and neutral notices are announcements; anything the user must act
   * on is an alert. Pass an explicit role only when the state is controlled by
   * a parent live region.
   */
  role?: "status" | "alert" | "none";
}

function Notice({ tone = "neutral", role, className, children, ...props }: NoticeProps) {
  const resolvedRole =
    role === "none"
      ? undefined
      : (role ?? (tone === "success" || tone === "neutral" ? "status" : "alert"));

  return (
    <p
      data-slot="notice"
      data-tone={tone}
      role={resolvedRole}
      className={cn("cloud-notice", toneClass[tone], className)}
      {...props}
    >
      {children}
    </p>
  );
}

export { Notice };
