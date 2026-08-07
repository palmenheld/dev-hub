export type ChannelStatus = "online" | "draft" | "missing";

export type Article = {
  id: string;
  sku: string;
  name: string;
  subtitle: string;
  stock: number;
  basePrice: number;
  active: boolean;
  channels: {
    shop: ChannelStatus;
    ebay: ChannelStatus;
    kleinanzeigen: ChannelStatus;
  };
};
