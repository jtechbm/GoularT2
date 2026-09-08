"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { id, now, one, run } from "@/lib/db";
import { isManager, requireUser } from "@/lib/auth";
import { str, strOrNull } from "@/lib/format";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function createChannelAction(formData: FormData) {
  const user = await requireUser();
  const name = str(formData.get("name"));
  if (!name) throw new Error("Informe o nome do canal.");

  let slug = slugify(name) || `canal-${Date.now()}`;
  if (one("SELECT id FROM chat_channels WHERE slug = ?", slug)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const clientId = strOrNull(formData.get("client_id"));
  run(
    `INSERT INTO chat_channels (id, slug, name, description, kind, client_id, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    id(),
    slug,
    name,
    strOrNull(formData.get("description")),
    clientId ? "cliente" : "equipe",
    clientId,
    user.id,
    now(),
  );

  revalidatePath("/chat");
  redirect(`/chat/${slug}`);
}

export async function sendMessageAction(formData: FormData) {
  const user = await requireUser();
  const slug = str(formData.get("slug"));
  const body = str(formData.get("body"));
  const channel = one<{ id: string }>("SELECT id FROM chat_channels WHERE slug = ?", slug);
  if (!channel || !body) redirect(`/chat/${slug}`);

  run(
    "INSERT INTO chat_messages (id, channel_id, user_id, body, created_at) VALUES (?,?,?,?,?)",
    id(),
    channel.id,
    user.id,
    body,
    now(),
  );
  run(
    `INSERT INTO chat_reads (channel_id, user_id, last_read_at) VALUES (?,?,?)
     ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
    channel.id,
    user.id,
    now(),
  );

  revalidatePath(`/chat/${slug}`);
  revalidatePath("/chat");
  redirect(`/chat/${slug}`);
}

export async function deleteChannelAction(formData: FormData) {
  const user = await requireUser();
  if (!isManager(user)) throw new Error("Somente gestores removem canais.");
  run("DELETE FROM chat_channels WHERE slug = ?", str(formData.get("slug")));
  revalidatePath("/chat");
  redirect("/chat");
}
