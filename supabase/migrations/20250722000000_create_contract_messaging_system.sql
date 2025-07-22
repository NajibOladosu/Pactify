-- Contract Messaging System Schema
-- Each contract has its own isolated chat conversation

-- Table for contract conversations
CREATE TABLE IF NOT EXISTS "public"."contract_conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_message_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    CONSTRAINT "contract_conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_conversations_contract_id_key" UNIQUE ("contract_id"),
    CONSTRAINT "contract_conversations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE
);

-- Table for messages within contract conversations
CREATE TABLE IF NOT EXISTS "public"."contract_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "message_type" "text" DEFAULT 'text' CHECK ("message_type" IN ('text', 'file', 'system', 'dispute_related')),
    "attachment_url" "text",
    "attachment_name" "text",
    "attachment_size" bigint,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "contract_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."contract_conversations"("id") ON DELETE CASCADE,
    CONSTRAINT "contract_messages_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE,
    CONSTRAINT "contract_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

-- Table for tracking read status per user
CREATE TABLE IF NOT EXISTS "public"."contract_message_read_status" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "contract_message_read_status_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_message_read_status_message_user_key" UNIQUE ("message_id", "user_id"),
    CONSTRAINT "contract_message_read_status_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."contract_messages"("id") ON DELETE CASCADE,
    CONSTRAINT "contract_message_read_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_contract_conversations_contract_id" ON "public"."contract_conversations"("contract_id");
CREATE INDEX IF NOT EXISTS "idx_contract_conversations_updated_at" ON "public"."contract_conversations"("updated_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_contract_messages_conversation_id" ON "public"."contract_messages"("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_contract_messages_contract_id" ON "public"."contract_messages"("contract_id");
CREATE INDEX IF NOT EXISTS "idx_contract_messages_sender_id" ON "public"."contract_messages"("sender_id");
CREATE INDEX IF NOT EXISTS "idx_contract_messages_created_at" ON "public"."contract_messages"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_contract_messages_deleted_at" ON "public"."contract_messages"("deleted_at");

CREATE INDEX IF NOT EXISTS "idx_contract_message_read_status_message_id" ON "public"."contract_message_read_status"("message_id");
CREATE INDEX IF NOT EXISTS "idx_contract_message_read_status_user_id" ON "public"."contract_message_read_status"("user_id");

-- Function to create conversation when contract is created
CREATE OR REPLACE FUNCTION "public"."create_contract_conversation"()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "public"."contract_conversations" ("contract_id", "created_at", "updated_at")
    VALUES (NEW.id, NOW(), NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update conversation timestamp when new message is sent
CREATE OR REPLACE FUNCTION "public"."update_conversation_timestamp"()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE "public"."contract_conversations"
    SET 
        "updated_at" = NOW(),
        "last_message_at" = NOW()
    WHERE "contract_id" = NEW.contract_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread message count for a user in a contract
CREATE OR REPLACE FUNCTION "public"."get_unread_message_count"("p_contract_id" uuid, "p_user_id" uuid)
RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::integer
        FROM "public"."contract_messages" cm
        LEFT JOIN "public"."contract_message_read_status" rs 
            ON cm.id = rs.message_id AND rs.user_id = p_user_id
        WHERE cm.contract_id = p_contract_id 
            AND cm.sender_id != p_user_id 
            AND cm.deleted_at IS NULL
            AND rs.id IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION "public"."mark_messages_as_read"("p_contract_id" uuid, "p_user_id" uuid)
RETURNS void AS $$
BEGIN
    INSERT INTO "public"."contract_message_read_status" ("message_id", "user_id", "read_at")
    SELECT cm.id, p_user_id, NOW()
    FROM "public"."contract_messages" cm
    LEFT JOIN "public"."contract_message_read_status" rs 
        ON cm.id = rs.message_id AND rs.user_id = p_user_id
    WHERE cm.contract_id = p_contract_id 
        AND cm.sender_id != p_user_id 
        AND cm.deleted_at IS NULL
        AND rs.id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers
DROP TRIGGER IF EXISTS "contract_conversation_creation" ON "public"."contracts";
CREATE TRIGGER "contract_conversation_creation"
    AFTER INSERT ON "public"."contracts"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."create_contract_conversation"();

DROP TRIGGER IF EXISTS "contract_message_timestamp_update" ON "public"."contract_messages";
CREATE TRIGGER "contract_message_timestamp_update"
    AFTER INSERT ON "public"."contract_messages"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_conversation_timestamp"();

-- RLS Policies
ALTER TABLE "public"."contract_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."contract_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."contract_message_read_status" ENABLE ROW LEVEL SECURITY;

-- RLS for contract_conversations: Users can access conversations for contracts they're involved in
CREATE POLICY "Users can view contract conversations they're involved in" ON "public"."contract_conversations"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."contracts" c
            WHERE c.id = contract_id
            AND (
                c.creator_id = auth.uid()
                OR c.client_email = (SELECT email FROM auth.users WHERE id = auth.uid())
                OR EXISTS (
                    SELECT 1 FROM "public"."contract_parties" cp
                    WHERE cp.contract_id = c.id AND cp.user_id = auth.uid()
                )
            )
        )
    );

-- RLS for contract_messages: Users can view messages in conversations for contracts they're involved in
CREATE POLICY "Users can view messages in their contract conversations" ON "public"."contract_messages"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."contracts" c
            WHERE c.id = contract_id
            AND (
                c.creator_id = auth.uid()
                OR c.client_email = (SELECT email FROM auth.users WHERE id = auth.uid())
                OR EXISTS (
                    SELECT 1 FROM "public"."contract_parties" cp
                    WHERE cp.contract_id = c.id AND cp.user_id = auth.uid()
                )
            )
        )
    );

-- RLS for sending messages: Users can send messages in conversations for contracts they're involved in
CREATE POLICY "Users can send messages in their contract conversations" ON "public"."contract_messages"
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM "public"."contracts" c
            WHERE c.id = contract_id
            AND (
                c.creator_id = auth.uid()
                OR c.client_email = (SELECT email FROM auth.users WHERE id = auth.uid())
                OR EXISTS (
                    SELECT 1 FROM "public"."contract_parties" cp
                    WHERE cp.contract_id = c.id AND cp.user_id = auth.uid()
                )
            )
        )
    );

-- RLS for message read status
CREATE POLICY "Users can manage their own read status" ON "public"."contract_message_read_status"
    FOR ALL USING (user_id = auth.uid());

-- Grant permissions
GRANT ALL ON "public"."contract_conversations" TO "authenticated";
GRANT ALL ON "public"."contract_messages" TO "authenticated";
GRANT ALL ON "public"."contract_message_read_status" TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_unread_message_count"(uuid, uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."mark_messages_as_read"(uuid, uuid) TO "authenticated";