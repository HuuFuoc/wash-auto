import { Types } from 'mongoose';
import {
  ChatSessionDocument,
  ChatSessionModel,
  IChatMessage,
} from './chat-session.model';

export class ChatSessionRepository {
  findBySessionId(sessionId: string): Promise<ChatSessionDocument | null> {
    return ChatSessionModel.findOne({ session_id: sessionId }).exec();
  }

  findByCustomer(customerId: string): Promise<ChatSessionDocument[]> {
    return ChatSessionModel.find({
      customer_id: new Types.ObjectId(customerId),
    })
      .sort({ updated_at: -1 })
      .limit(20)
      .exec();
  }

  create(input: {
    sessionId: string;
    customerId?: string | null;
  }): Promise<ChatSessionDocument> {
    return ChatSessionModel.create({
      session_id: input.sessionId,
      customer_id: input.customerId
        ? new Types.ObjectId(input.customerId)
        : null,
      messages: [],
    });
  }

  appendMessages(
    sessionId: string,
    messages: IChatMessage[],
  ): Promise<ChatSessionDocument | null> {
    return ChatSessionModel.findOneAndUpdate(
      { session_id: sessionId },
      { $push: { messages: { $each: messages } } },
      { returnDocument: 'after' },
    ).exec();
  }
}
