import os from "node:os";

const collectLocalOrigins = () => {
  const hosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
  const interfaces = os.networkInterfaces();

  for (const networkInterface of Object.values(interfaces)) {
    if (!networkInterface) continue;
    for (const address of networkInterface) {
      if (address.internal) continue;
      if (address.family !== "IPv4") continue;
      hosts.add(address.address);
    }
  }

  if (process.env.ALLOWED_DEV_ORIGINS) {
    for (const origin of process.env.ALLOWED_DEV_ORIGINS.split(",")) {
      const normalized = origin.trim();
      if (normalized) hosts.add(normalized);
    }
  }

  return [...hosts];
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: collectLocalOrigins(),
};

export default nextConfig;
