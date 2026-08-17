import type {
  Category,
  Material,
  GenerateDesignResponse,
  DesignSelection,
  Tenant,
  PriceBreakdown,
} from "@/types/domain";

/** Shape returned by every route wrapped in withErrorHandling (see lib/api-error.ts). */
interface ApiErrorBody {
  error: string;
  code?: string;
}

export class ApiRequestError extends Error {
  code?: string;
  status: number;
  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.status = status;
    this.code = body.code;
  }
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

/**
 * Central fetch wrapper: turns non-2xx responses into a typed ApiRequestError
 * with the server's actual message, and turns network failures (offline,
 * DNS, timeout) into a consistent, user-readable message instead of a raw
 * TypeError bubbling up into component state.
 */
async function apiFetch<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiRequestError(0, {
      error: "Could not reach the server. Check your connection and try again.",
      code: "network_error",
    });
  }

  if (!res.ok) {
    const body: ApiErrorBody = await res
      .json()
      .catch(() => ({ error: `Request failed (${res.status})` }));
    throw new ApiRequestError(res.status, body);
  }

  return res.json();
}

export async function fetchTenant(accessToken: string): Promise<Tenant> {
  const { tenant } = await apiFetch<{ tenant: Tenant }>("/api/tenant/me", {
    headers: authHeaders(accessToken),
  });
  return tenant;
}

export async function bootstrapTenant(
  accessToken: string,
  companyName: string
): Promise<Tenant> {
  const { tenant } = await apiFetch<{ tenant: Tenant }>("/api/tenant/bootstrap", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ company_name: companyName }),
  });
  return tenant;
}

export async function updateTenant(
  accessToken: string,
  input: {
    returns_accepted?: boolean;
    return_policy_note?: string | null;
    bio?: string | null;
    location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    specialty_materials?: string[];
    max_design_revisions?: number;
  }
): Promise<Tenant> {
  const { tenant } = await apiFetch<{ tenant: Tenant }>("/api/tenant/me", {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return tenant;
}

export async function uploadTenantProfileImage(
  accessToken: string,
  kind: "logo" | "cover",
  file: File
): Promise<Tenant> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("image", file);
  const { tenant } = await apiFetch<{ tenant: Tenant }>("/api/tenant/profile-image", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  return tenant;
}

export async function fetchCategories(accessToken: string): Promise<Category[]> {
  const { categories } = await apiFetch<{ categories: Category[] }>("/api/categories", {
    headers: authHeaders(accessToken),
  });
  return categories;
}

export async function fetchMaterials(
  accessToken: string,
  type?: "metal" | "gemstone" | "finish"
): Promise<Material[]> {
  const url = type ? `/api/materials?type=${type}` : "/api/materials";
  const { materials } = await apiFetch<{ materials: Material[] }>(url, {
    headers: authHeaders(accessToken),
  });
  return materials;
}

export async function createCategory(
  accessToken: string,
  input: { name: string; ai_prompt_tag: string; base_processing_cost: number }
): Promise<Category> {
  const { category } = await apiFetch<{ category: Category }>("/api/categories", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return category;
}

export async function deleteCategory(accessToken: string, id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/categories/${id}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function createMaterial(
  accessToken: string,
  input: Omit<Material, "id" | "tenant_id">
): Promise<Material> {
  const { material } = await apiFetch<{ material: Material }>("/api/materials", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return material;
}

export async function deleteMaterial(accessToken: string, id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/materials/${id}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function generateDesign(
  accessToken: string,
  selection: DesignSelection
): Promise<GenerateDesignResponse> {
  return apiFetch<GenerateDesignResponse>("/api/design/generate", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(selection),
  });
}

export async function generateDesignFromReferenceInStore(
  accessToken: string,
  input: DesignSelection & { image: File; note?: string }
): Promise<GenerateDesignResponse> {
  const form = new FormData();
  form.set("image", input.image);
  if (input.note) form.set("note", input.note);
  form.set("category_id", input.category_id);
  form.set("metal_material_id", input.metal_material_id);
  form.set("gemstone_material_ids", JSON.stringify(input.gemstone_material_ids));
  if (input.finish_material_id) form.set("finish_material_id", input.finish_material_id);
  form.set("estimated_weight_grams", String(input.estimated_weight_grams));
  if (input.customer_name) form.set("customer_name", input.customer_name);

  return apiFetch<GenerateDesignResponse>("/api/design/generate-from-reference", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
}

export interface DesignHistoryRow {
  id: string;
  customer_name: string | null;
  generated_image_url: string;
  calculated_price_usd: number;
  created_at: string;
  share_token: string;
  categories: { name: string } | null;
}

export async function fetchDesignHistory(
  accessToken: string,
  customerSearch?: string
): Promise<DesignHistoryRow[]> {
  const url = customerSearch
    ? `/api/design?customer=${encodeURIComponent(customerSearch)}`
    : "/api/design";
  const { designs } = await apiFetch<{ designs: DesignHistoryRow[] }>(url, {
    headers: authHeaders(accessToken),
  });
  return designs;
}

// =========================================================
// Marketplace: shops, customer profile, conversations, chat
// =========================================================

export interface ShopSummary {
  id: string;
  company_name: string;
  bio: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  location: string | null;
  specialty_materials: string[];
  verified: boolean;
  returns_accepted: boolean;
  average_rating: number | null;
  review_count: number;
  distance_km: number | null;
}

export interface ShopFilterOptions {
  locations: string[];
  materials: string[];
}

export interface ShopSearchFilters {
  q?: string;
  location?: string;
  materials?: string[];
  verified?: boolean;
  returnsAccepted?: boolean;
  minRating?: number;
  near?: { lat: number; lng: number };
}

export async function fetchShops(
  filters: ShopSearchFilters = {}
): Promise<{ shops: ShopSummary[]; filters: ShopFilterOptions }> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.location) params.set("location", filters.location);
  if (filters.materials?.length) params.set("materials", filters.materials.join(","));
  if (filters.verified) params.set("verified", "true");
  if (filters.returnsAccepted) params.set("returns_accepted", "true");
  if (filters.minRating) params.set("min_rating", String(filters.minRating));
  if (filters.near) {
    params.set("lat", String(filters.near.lat));
    params.set("lng", String(filters.near.lng));
  }

  const qs = params.toString();
  return apiFetch<{ shops: ShopSummary[]; filters: ShopFilterOptions }>(
    qs ? `/api/shops?${qs}` : "/api/shops",
    {}
  );
}

export interface ShopPortfolioItem {
  id: string;
  media_type: "image" | "video";
  image_url: string | null;
  video_url: string | null;
  caption: string | null;
  description: string | null;
  materials: string | null;
  boost_expires_at?: string | null;
}

export interface ShopProfile {
  shop: {
    id: string;
    company_name: string;
    bio: string | null;
    logo_url: string | null;
    cover_image_url: string | null;
    location: string | null;
    specialty_materials: string[];
  };
  verified: boolean;
  returns_accepted: boolean;
  return_policy_note: string | null;
  average_response_hours: number | null;
  follower_count: number;
  is_following: boolean;
  average_rating: number | null;
  review_count: number;
  reviews: { id: string; rating: number; comment: string | null; created_at: string; customers: { display_name: string } | null }[];
  portfolio: ShopPortfolioItem[];
  catalog: {
    categories: Category[];
    materials: Material[];
  };
}

export async function fetchShopProfile(shopId: string, accessToken?: string): Promise<ShopProfile> {
  return apiFetch<ShopProfile>(`/api/shops/${shopId}`, {
    headers: accessToken ? authHeaders(accessToken) : undefined,
  });
}

export async function followShop(accessToken: string, tenantId: string): Promise<void> {
  await apiFetch<{ ok: true }>("/api/follows", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ tenant_id: tenantId }),
  });
}

export async function unfollowShop(accessToken: string, tenantId: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/follows/${tenantId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function fetchFollowedShopIds(accessToken: string): Promise<string[]> {
  const { tenant_ids } = await apiFetch<{ tenant_ids: string[] }>("/api/follows", {
    headers: authHeaders(accessToken),
  });
  return tenant_ids;
}

export interface Customer {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export async function fetchCustomer(accessToken: string): Promise<Customer> {
  const { customer } = await apiFetch<{ customer: Customer }>("/api/customer/me", {
    headers: authHeaders(accessToken),
  });
  return customer;
}

export async function bootstrapCustomer(accessToken: string, displayName: string): Promise<Customer> {
  const { customer } = await apiFetch<{ customer: Customer }>("/api/customer/bootstrap", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ display_name: displayName }),
  });
  return customer;
}

export interface ConversationSummary {
  id: string;
  tenant_id: string;
  customer_id: string;
  status: "open" | "closed";
  last_message_at: string;
  created_at: string;
  last_message_preview: string | null;
  tenants: { company_name: string; logo_url: string | null } | null;
  customers: { display_name: string; avatar_url: string | null; email_verified: boolean } | null;
}

export async function fetchConversations(
  accessToken: string,
  role: "customer" | "shop"
): Promise<ConversationSummary[]> {
  const { conversations } = await apiFetch<{ conversations: ConversationSummary[] }>(
    `/api/conversations?role=${role}`,
    { headers: authHeaders(accessToken) }
  );
  return conversations;
}

export async function startConversation(accessToken: string, tenantId: string): Promise<string> {
  const { conversation_id } = await apiFetch<{ conversation_id: string }>("/api/conversations", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  return conversation_id;
}

export interface ChatMessage {
  id: string;
  sender_type: "customer" | "shop";
  sender_id: string;
  body: string | null;
  design_id: string | null;
  created_at: string;
  designs: { generated_image_url: string; calculated_price_usd: number } | null;
}

export async function fetchMessages(accessToken: string, conversationId: string): Promise<ChatMessage[]> {
  const { messages } = await apiFetch<{ messages: ChatMessage[] }>(
    `/api/conversations/${conversationId}/messages`,
    { headers: authHeaders(accessToken) }
  );
  return messages;
}

export async function sendMessage(
  accessToken: string,
  conversationId: string,
  body: string
): Promise<ChatMessage> {
  const { message } = await apiFetch<{ message: ChatMessage }>(
    `/api/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ body }),
    }
  );
  return message;
}

export interface InChatGenerateSelection {
  category_id: string;
  metal_material_id: string;
  gemstone_material_ids: string[];
  finish_material_id: string | null;
  estimated_weight_grams: number;
}

export interface InChatGenerateResult {
  design_id: string;
  generated_image_url: string;
  price: PriceBreakdown;
  cached: boolean;
  message_id: string | null;
  revision_status?: RevisionStatus;
  warning?: string;
}

// =========================================================
// Stripe Connect
// =========================================================

export interface StripeConnectStatus {
  connected: boolean;
  charges_enabled: boolean;
}

export async function fetchStripeConnectStatus(accessToken: string): Promise<StripeConnectStatus> {
  return apiFetch<StripeConnectStatus>("/api/stripe/connect", {
    headers: authHeaders(accessToken),
  });
}

export async function startStripeOnboarding(accessToken: string): Promise<string> {
  const { url } = await apiFetch<{ url: string }>("/api/stripe/connect", {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  return url;
}

// =========================================================
// Orders & reviews
// =========================================================

export type OrderFulfillmentType = "shop_visit" | "online_payment";
export type OrderStatus =
  | "proposed"
  | "confirmed"
  | "in_progress"
  | "ready"
  | "completed"
  | "cancelled";

export interface Order {
  id: string;
  conversation_id: string;
  customer_id: string;
  tenant_id: string;
  design_id: string | null;
  fulfillment_type: OrderFulfillmentType;
  status: OrderStatus;
  proposed_datetime: string | null;
  appointment_note: string | null;
  amount_usd: number;
  platform_fee_usd: number;
  stripe_fee_usd: number | null;
  customer_charge_usd: number | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchOrders(accessToken: string, conversationId: string): Promise<Order[]> {
  const { orders } = await apiFetch<{ orders: Order[] }>(
    `/api/orders?conversation_id=${conversationId}`,
    { headers: authHeaders(accessToken) }
  );
  return orders;
}

export async function createOrder(
  accessToken: string,
  input: {
    conversation_id: string;
    design_id?: string | null;
    fulfillment_type: OrderFulfillmentType;
    amount_usd: number;
    proposed_datetime?: string | null;
    appointment_note?: string | null;
  }
): Promise<Order> {
  const { order } = await apiFetch<{ order: Order }>("/api/orders", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return order;
}

export async function patchOrder(
  accessToken: string,
  orderId: string,
  action: "confirm" | "advance" | "cancel"
): Promise<Order> {
  const { order } = await apiFetch<{ order: Order }>(`/api/orders/${orderId}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ action }),
  });
  return order;
}

export async function startOrderCheckout(accessToken: string, orderId: string): Promise<string> {
  const { url } = await apiFetch<{ url: string }>(`/api/orders/${orderId}/checkout`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  return url;
}

export async function submitReview(
  accessToken: string,
  input: { order_id: string; rating: number; comment?: string }
): Promise<void> {
  await apiFetch<{ review: unknown }>("/api/reviews", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export async function submitReport(
  accessToken: string,
  input: { conversation_id: string; message_id?: string; reason: string; details?: string }
): Promise<void> {
  await apiFetch<{ report: unknown }>("/api/reports", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

// =========================================================
// Portfolio management (shop side)
// =========================================================

export interface PortfolioItem {
  id: string;
  design_id: string | null;
  media_type: "image" | "video";
  image_url: string | null;
  video_url: string | null;
  caption: string | null;
  description: string | null;
  materials: string | null;
  sort_order: number;
  created_at: string;
  boost_expires_at: string | null;
}

export async function fetchMyPortfolio(accessToken: string): Promise<PortfolioItem[]> {
  const { items } = await apiFetch<{ items: PortfolioItem[] }>("/api/portfolio", {
    headers: authHeaders(accessToken),
  });
  return items;
}

export interface AddPortfolioItemInput {
  design_id?: string;
  image?: File;
  title?: string;
  description?: string;
  materials?: string;
}

export async function addPortfolioItem(
  accessToken: string,
  input: AddPortfolioItemInput
): Promise<PortfolioItem> {
  const form = new FormData();
  if (input.design_id) form.set("design_id", input.design_id);
  if (input.image) form.set("image", input.image);
  if (input.title) form.set("title", input.title);
  if (input.description) form.set("description", input.description);
  if (input.materials) form.set("materials", input.materials);

  const { item } = await apiFetch<{ item: PortfolioItem }>("/api/portfolio", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  return item;
}

export interface AddPortfolioVideoInput {
  video?: File;
  design_id?: string;
  image?: File;
  motion_prompt?: string;
  title?: string;
  description?: string;
  materials?: string;
}

export async function addPortfolioVideo(
  accessToken: string,
  input: AddPortfolioVideoInput
): Promise<PortfolioItem> {
  const form = new FormData();
  if (input.video) form.set("video", input.video);
  if (input.design_id) form.set("design_id", input.design_id);
  if (input.image) form.set("image", input.image);
  if (input.motion_prompt) form.set("motion_prompt", input.motion_prompt);
  if (input.title) form.set("title", input.title);
  if (input.description) form.set("description", input.description);
  if (input.materials) form.set("materials", input.materials);

  const { item } = await apiFetch<{ item: PortfolioItem }>("/api/portfolio/video", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  return item;
}

export async function updatePortfolioItem(
  accessToken: string,
  id: string,
  input: { caption?: string | null; description?: string | null; materials?: string | null; sort_order?: number }
): Promise<PortfolioItem> {
  const { item } = await apiFetch<{ item: PortfolioItem }>(`/api/portfolio/${id}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return item;
}

export async function deletePortfolioItem(accessToken: string, id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/portfolio/${id}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

// =========================================================
// Feed engagement: like / save / comment / boost
// =========================================================

export async function likePortfolioItem(accessToken: string, id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/portfolio/${id}/like`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
}

export async function unlikePortfolioItem(accessToken: string, id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/portfolio/${id}/like`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function savePortfolioItem(accessToken: string, id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/portfolio/${id}/save`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
}

export async function unsavePortfolioItem(accessToken: string, id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/portfolio/${id}/save`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export interface PortfolioComment {
  id: string;
  customer_id: string;
  body: string;
  created_at: string;
  customers: { display_name: string; avatar_url: string | null } | null;
}

export async function fetchPortfolioComments(id: string): Promise<PortfolioComment[]> {
  const { comments } = await apiFetch<{ comments: PortfolioComment[] }>(`/api/portfolio/${id}/comments`, {});
  return comments;
}

export async function postPortfolioComment(
  accessToken: string,
  id: string,
  body: string
): Promise<PortfolioComment> {
  const { comment } = await apiFetch<{ comment: PortfolioComment }>(`/api/portfolio/${id}/comments`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ body }),
  });
  return comment;
}

export async function deletePortfolioComment(accessToken: string, portfolioItemId: string, commentId: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/portfolio/${portfolioItemId}/comments/${commentId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function boostPortfolioItem(accessToken: string, id: string): Promise<{ boost_expires_at: string }> {
  return apiFetch<{ boost_expires_at: string }>(`/api/portfolio/${id}/boost`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
}

export async function unboostPortfolioItem(accessToken: string, id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/portfolio/${id}/boost`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

// =========================================================
// Feed
// =========================================================

export interface FeedItem {
  id: string;
  media_type: "image" | "video";
  image_url: string | null;
  video_url: string | null;
  caption: string | null;
  description: string | null;
  materials: string | null;
  created_at: string;
  boosted: boolean;
  shop: { id: string; company_name: string; logo_url: string | null; verified: boolean };
  likes_count: number;
  saves_count: number;
  comments_count: number;
  liked: boolean;
  saved: boolean;
}

export async function fetchFeed(
  mode: "discover" | "following",
  offset: number,
  limit: number,
  accessToken?: string
): Promise<{ items: FeedItem[]; has_more: boolean }> {
  return apiFetch<{ items: FeedItem[]; has_more: boolean }>(
    `/api/feed?mode=${mode}&offset=${offset}&limit=${limit}`,
    { headers: accessToken ? authHeaders(accessToken) : undefined }
  );
}

export async function generateInConversation(
  accessToken: string,
  conversationId: string,
  selection: InChatGenerateSelection
): Promise<InChatGenerateResult> {
  return apiFetch<InChatGenerateResult>(`/api/conversations/${conversationId}/generate`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(selection),
  });
}

// =========================================================
// Design revision limit + advisor + reference-image generation
// =========================================================

export interface RevisionStatus {
  used: number;
  max: number;
  remaining: number;
  blocked: boolean;
}

export async function fetchRevisionStatus(accessToken: string, conversationId: string): Promise<RevisionStatus> {
  return apiFetch<RevisionStatus>(`/api/conversations/${conversationId}/revision-status`, {
    headers: authHeaders(accessToken),
  });
}

export async function grantMoreRevisions(accessToken: string, conversationId: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/conversations/${conversationId}/grant-revisions`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
}

export async function fetchDesignAdvice(accessToken: string, conversationId: string): Promise<string> {
  const { advice } = await apiFetch<{ advice: string }>(`/api/conversations/${conversationId}/advice`, {
    headers: authHeaders(accessToken),
  });
  return advice;
}

export async function generateFromReference(
  accessToken: string,
  conversationId: string,
  input: {
    image: File;
    note?: string;
    category_id: string;
    metal_material_id: string;
    gemstone_material_ids: string[];
    finish_material_id: string | null;
    estimated_weight_grams: number;
  }
): Promise<InChatGenerateResult> {
  const form = new FormData();
  form.set("image", input.image);
  if (input.note) form.set("note", input.note);
  form.set("category_id", input.category_id);
  form.set("metal_material_id", input.metal_material_id);
  form.set("gemstone_material_ids", JSON.stringify(input.gemstone_material_ids));
  if (input.finish_material_id) form.set("finish_material_id", input.finish_material_id);
  form.set("estimated_weight_grams", String(input.estimated_weight_grams));

  return apiFetch<InChatGenerateResult>(`/api/conversations/${conversationId}/generate-from-reference`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
}
