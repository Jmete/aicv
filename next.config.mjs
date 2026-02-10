import os from "node:os";

const collectLocalOrigins = () => {
  const hosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

  const machineHost = os.hostname().trim();
  if (machineHost) {
    hosts.add(machineHost);
  }

  try {
    const interfaces = os.networkInterfaces();
    for (const networkInterface of Object.values(interfaces)) {
      if (!networkInterface) continue;
      for (const address of networkInterface) {
        if (address.internal) continue;
        if (address.family !== "IPv4" && address.family !== "IPv6") continue;
        hosts.add(address.address);
      }
    }
  } catch (error) {
    console.warn("Unable to resolve network interfaces for allowedDevOrigins:", error);
  }

  const allowList = process.env.ALLOWED_DEV_ORIGINS;
  if (allowList) {
    for (const origin of allowList.split(",")) {
      const normalized = origin.trim();
      if (normalized) {
        hosts.add(normalized);
      }
    }
  }

  return [...hosts].sort();
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NODE_ENV === "development"
    ? {
        allowedDevOrigins: collectLocalOrigins(),
      }
    : {}),
};

export default nextConfig;
