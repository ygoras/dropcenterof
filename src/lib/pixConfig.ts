import { api } from "@/lib/apiClient";

export interface PixConfig {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
}

const defaultConfig: PixConfig = {
  pixKey: "",
  merchantName: "DropCenter",
  merchantCity: "SAO PAULO",
};

export async function getPixConfig(): Promise<PixConfig> {
  try {
    const data = await api.get<Partial<PixConfig>>("/api/settings/pix-config");
    if (data && typeof data === "object") {
      return { ...defaultConfig, ...data };
    }
  } catch {
    // fallback
  }
  return defaultConfig;
}

export async function savePixConfig(config: PixConfig): Promise<boolean> {
  try {
    await api.post("/api/settings/pix-config", config);
    return true;
  } catch {
    return false;
  }
}

export async function isPixConfigured(): Promise<boolean> {
  const config = await getPixConfig();
  return config.pixKey.length > 0;
}
