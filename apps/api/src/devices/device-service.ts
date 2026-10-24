import type {
  MiraDevice,
  RegisterDeviceRequest,
} from "@uichat-mira/cloud-auth-contracts";
import type { AuthService } from "../auth/auth-service.js";
import type { DeviceRecord, DeviceRepository } from "./device-repository.js";

export type DeviceErrorCode = "DEVICE_REVOKED" | "DEVICE_PLATFORM_MISMATCH";

export class DeviceError extends Error {
  constructor(
    readonly code: DeviceErrorCode,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export class DeviceService {
  constructor(
    private readonly repository: DeviceRepository,
    private readonly authService: AuthService,
  ) {}

  register(token: string, request: RegisterDeviceRequest): MiraDevice {
    const account = this.authService.requireAccountIdentity(token);
    const device = this.repository.registerDevice({
      accountId: account.id,
      installationId: request.installationId.toLowerCase(),
      platform: request.platform,
      clientName: request.clientName?.trim() ?? null,
      clientVersion: request.clientVersion?.trim() ?? null,
      now: new Date().toISOString(),
    });

    if (device === "platform_mismatch") {
      throw new DeviceError(
        "DEVICE_PLATFORM_MISMATCH",
        409,
        "Mira Device platform cannot change",
      );
    }

    if (!device) {
      throw new DeviceError(
        "DEVICE_REVOKED",
        409,
        "This Mira Device has been revoked",
      );
    }

    return publicDevice(device);
  }

  list(token: string): MiraDevice[] {
    const account = this.authService.requireAccountIdentity(token);
    return this.repository.listDevicesByAccount(account.id).map(publicDevice);
  }
}

function publicDevice(device: DeviceRecord): MiraDevice {
  return {
    id: device.id,
    platform: device.platform,
    clientName: device.clientName,
    clientVersion: device.clientVersion,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt,
  };
}
