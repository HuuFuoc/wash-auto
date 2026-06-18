import { HydratedDocument, Schema, Types, model } from 'mongoose';

export type ChatMessageRole = 'user' | 'model';

export interface IChatMessage {
  role: ChatMessageRole;
  content: string;
  created_at: Date;
}

// Plain-Mongoose rewrite of features/chat/entities/chat-session.entity.ts.
export interface ChatSession {
  customer_id: Types.ObjectId | null;
  session_id: string;
  messages: IChatMessage[];
  metadata: Record<string, unknown>;
}

export type ChatSessionDocument = HydratedDocument<ChatSession>;

const messageSchema = new Schema<IChatMessage>(
  {
    role: { type: String, enum: ['user', 'model'], required: true },
    content: { type: String, required: true },
    created_at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const chatSessionSchema = new Schema<ChatSession>(
  {
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    session_id: { type: String, required: true, unique: true, index: true },
    messages: { type: [messageSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'chat_sessions',
  },
);

export const ChatSessionModel = model<ChatSession>(
  'ChatSession',
  chatSessionSchema,
);
