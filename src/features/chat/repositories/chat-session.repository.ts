import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ChatSession,
  ChatSessionDocument,
  IChatMessage,
} from '../entities/chat-session.entity';

@Injectable()
export class ChatSessionRepository {
  constructor(
    @InjectModel(ChatSession.name)
    private readonly model: Model<ChatSessionDocument>,
  ) {}

  findBySessionId(sessionId: string): Promise<ChatSessionDocument | null> {
    return this.model.findOne({ session_id: sessionId }).exec();
  }

  findByCustomer(customerId: string): Promise<ChatSessionDocument[]> {
    return this.model
      .find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ updated_at: -1 })
      .limit(20)
      .exec();
  }

  create(input: {
    sessionId: string;
    customerId?: string | null;
  }): Promise<ChatSessionDocument> {
    return this.model.create({
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
    return this.model
      .findOneAndUpdate(
        { session_id: sessionId },
        { $push: { messages: { $each: messages } } },
        { returnDocument: 'after' },
      )
      .exec();
  }
}
