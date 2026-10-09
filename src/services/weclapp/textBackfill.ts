import { listDrafts } from "@/services/shopware/dataStore";
import { listEbayDrafts } from "@/services/ebay/store";
import { getKleinanzeigenListings } from "@/services/kleinanzeigen/listingStore";
import {
  syncEbayDraft,
  syncKleinanzeigenListing,
  syncShopwareDraft,
  type BacksyncChannel,
} from "@/services/weclapp/channelBacksync";
import type { WeclappBacksyncResult } from "@/types/weclappBacksync";

type BackfillItem = {
  articleNumber: string;
  sync: () => Promise<WeclappBacksyncResult>;
};

async function channelItems(channel: BacksyncChannel): Promise<BackfillItem[]> {
  if (channel === "shopware") {
    return (await listDrafts(1000)).map((draft) => ({
      articleNumber: draft.source.articleNumber,
      sync: () => syncShopwareDraft(draft, { syncPrice: false }),
    }));
  }
  if (channel === "ebay") {
    return (await listEbayDrafts(1000)).map((draft) => ({
      articleNumber: draft.source.articleNumber,
      sync: () => syncEbayDraft(draft, { syncPrice: false }),
    }));
  }

  const latest = new Map<string, Awaited<ReturnType<typeof getKleinanzeigenListings>>[number]>();
  for (const listing of await getKleinanzeigenListings()) {
    if (!listing.articleId) continue;
    const key = listing.articleId || listing.sku;
    if (!latest.has(key)) latest.set(key, listing);
  }
  return [...latest.values()].map((listing) => ({
    articleNumber: listing.sku,
    sync: () => syncKleinanzeigenListing(listing, { syncPrice: false }),
  }));
}

export async function backfillChannelTexts(
  channel: BacksyncChannel,
  offset: number,
  limit: number
) {
  const items = await channelItems(channel);
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));
  const batch = items.slice(safeOffset, safeOffset + safeLimit);
  const results: Array<{
    articleNumber: string;
    state: WeclappBacksyncResult["state"];
    message: string;
  }> = [];

  for (const item of batch) {
    const result = await item.sync();
    results.push({
      articleNumber: item.articleNumber,
      state: result.state,
      message: result.message,
    });
  }

  const nextOffset = safeOffset + batch.length;
  return {
    channel,
    total: items.length,
    processed: nextOffset,
    nextOffset,
    done: nextOffset >= items.length,
    results,
  };
}
