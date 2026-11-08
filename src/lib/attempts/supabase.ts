// The Supabase side of attempts: `RemoteDb` over the browser client. Row-level security limits every query to the
// signed-in user's own rows; the `user_id` we send is only what the policies check against.

import type { createClient } from "../supabase/client.ts";
import type { MasteryMap } from "../mastery/mastery.ts";
import type { RemoteDb } from "./flush.ts";

type Client = NonNullable<ReturnType<typeof createClient>>;

interface MasteryDbRow {
  pattern: string;
  skill: string;
  modality: string;
  score: number;
  attempts_n: number;
  last_seen: string | null;
}

export function supabaseRemote(client: Client): RemoteDb {
  return {
    async userId() {
      // getSession reads the stored session (no network call); RLS is the real gate on the server.
      const { data } = await client.auth.getSession();
      return data.session?.user.id ?? null;
    },

    async insertAttempt(userId, item) {
      // `client_id` (migration 0002) + ignoreDuplicates = ON CONFLICT DO NOTHING: a retry inserts nothing and returns no row.
      const { data, error } = await client
        .from("attempts")
        .upsert({ ...item.row, user_id: userId, client_id: item.id }, { onConflict: "user_id,client_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async loadMastery(userId, patterns) {
      const { data, error } = await client
        .from("skill_mastery")
        .select("pattern, skill, modality, score, attempts_n, last_seen")
        .eq("user_id", userId)
        .in("pattern", patterns);
      if (error) throw error;
      const out: MasteryMap = {};
      for (const r of (data ?? []) as MasteryDbRow[]) {
        out[`${r.pattern}|${r.skill}|${r.modality}`] = { score: r.score, attemptsN: r.attempts_n, lastSeen: r.last_seen };
      }
      return out;
    },

    async upsertMastery(userId, entries) {
      const rows = Object.entries(entries).map(([key, e]) => {
        const [pattern, skill, modality] = key.split("|");
        return { user_id: userId, pattern, skill, modality, score: e.score, attempts_n: e.attemptsN, last_seen: e.lastSeen };
      });
      if (rows.length === 0) return;
      const { error } = await client.from("skill_mastery").upsert(rows, { onConflict: "user_id,pattern,skill,modality" });
      if (error) throw error;
    },
  };
}
