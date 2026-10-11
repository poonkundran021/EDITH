import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const telemetry = sqliteTable("telemetry", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  receivedAt: integer("received_at").notNull(),
});
