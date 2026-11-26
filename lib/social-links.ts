export const socialChannels = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  threads: "Threads",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  bluesky: "Bluesky",
  snapchat: "Snapchat",
  twitch: "Twitch",
  other: "Other",
} as const;

export type SocialChannel = keyof typeof socialChannels;
export type SocialLink = { channel: SocialChannel; url: string };
