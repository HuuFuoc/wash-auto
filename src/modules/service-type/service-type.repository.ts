import { Types } from 'mongoose';
import { ServiceTypeDocument, ServiceTypeModel } from './service-type.model';

export interface IVehiclePricingInput {
  vehicleTypeId: string;
  price: Types.Decimal128;
  estimatedMinutes: number;
  isActive?: boolean;
}

export interface ICreateServiceTypeInput {
  name: string;
  description?: string;
  basePrice: Types.Decimal128;
  estimatedMinutes: number;
  pointsMultiplier: number;
  checklistTemplate?: string[];
  isVoucherEligible?: boolean;
  vehiclePricing?: IVehiclePricingInput[];
}

export interface IUpdateServiceTypeInput {
  name?: string;
  description?: string;
  basePrice?: Types.Decimal128;
  estimatedMinutes?: number;
  pointsMultiplier?: number;
  checklistTemplate?: string[];
  isVoucherEligible?: boolean;
  vehiclePricing?: IVehiclePricingInput[];
}

/** Maps camelCase pricing inputs to the snake_case sub-doc shape. */
function toVehiclePricingDocs(rows: IVehiclePricingInput[]) {
  return rows.map((row) => ({
    vehicle_type_id: new Types.ObjectId(row.vehicleTypeId),
    price: row.price,
    estimated_minutes: row.estimatedMinutes,
    is_active: row.isActive ?? true,
  }));
}

export class ServiceTypeRepository {
  async findActive(): Promise<ServiceTypeDocument[]> {
    return ServiceTypeModel.find({ is_active: true }).sort({ name: 1 }).exec();
  }

  async findAll(): Promise<ServiceTypeDocument[]> {
    return ServiceTypeModel.find().sort({ name: 1 }).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<ServiceTypeDocument | null> {
    return ServiceTypeModel.findById(id).exec();
  }

  async existsByName(name: string): Promise<boolean> {
    const found = await ServiceTypeModel.exists({ name }).exec();
    return found !== null;
  }

  async create(input: ICreateServiceTypeInput): Promise<ServiceTypeDocument> {
    return ServiceTypeModel.create({
      name: input.name,
      description: input.description,
      base_price: input.basePrice,
      estimated_minutes: input.estimatedMinutes,
      points_multiplier: input.pointsMultiplier,
      checklist_template: input.checklistTemplate ?? [],
      is_voucher_eligible: input.isVoucherEligible ?? true,
      vehicle_pricing: toVehiclePricingDocs(input.vehiclePricing ?? []),
    });
  }

  async update(
    id: Types.ObjectId | string,
    input: IUpdateServiceTypeInput,
  ): Promise<ServiceTypeDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.description !== undefined) update.description = input.description;
    if (input.basePrice !== undefined) update.base_price = input.basePrice;
    if (input.estimatedMinutes !== undefined)
      update.estimated_minutes = input.estimatedMinutes;
    if (input.pointsMultiplier !== undefined)
      update.points_multiplier = input.pointsMultiplier;
    if (input.checklistTemplate !== undefined)
      update.checklist_template = input.checklistTemplate;
    if (input.isVoucherEligible !== undefined)
      update.is_voucher_eligible = input.isVoucherEligible;
    if (input.vehiclePricing !== undefined)
      update.vehicle_pricing = toVehiclePricingDocs(input.vehiclePricing);

    return ServiceTypeModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  async setActive(
    id: Types.ObjectId | string,
    isActive: boolean,
  ): Promise<ServiceTypeDocument | null> {
    return ServiceTypeModel.findByIdAndUpdate(
      id,
      { $set: { is_active: isActive } },
      { returnDocument: 'after' },
    ).exec();
  }
}
