import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Vehicle, VehicleDocument } from '../entities/vehicle.entity';

type VehicleQuery = {
  customer_id?: Types.ObjectId;
  vehicle_type_id?: Types.ObjectId;
  license_plate?: string | { $regex: string; $options: string };
  is_active?: boolean;
};

export interface ICreateVehicleInput {
  customerId: Types.ObjectId;
  vehicleTypeId: Types.ObjectId;
  licensePlate: string;
  nickname?: string;
  brand?: string;
  carModel?: string;
  color?: string;
  isDefault?: boolean;
}

export interface IUpdateVehicleInput {
  vehicleTypeId?: Types.ObjectId;
  licensePlate?: string;
  nickname?: string;
  brand?: string;
  carModel?: string;
  color?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface IVehicleListFilter {
  customerId?: Types.ObjectId;
  vehicleTypeId?: Types.ObjectId;
  licensePlateLike?: string;
  isActive?: boolean;
}

@Injectable()
export class VehicleRepository {
  constructor(
    @InjectModel(Vehicle.name)
    private readonly model: Model<VehicleDocument>,
  ) {}

  async findByOwner(
    customerId: Types.ObjectId | string,
    includeInactive = false,
  ): Promise<VehicleDocument[]> {
    const query: VehicleQuery = { customer_id: new Types.ObjectId(customerId) };
    if (!includeInactive) query.is_active = true;
    return this.model
      .find(query)
      .sort({ is_default: -1, created_at: -1 })
      .exec();
  }

  async findByIdForOwner(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<VehicleDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOne({ _id: id, customer_id: new Types.ObjectId(customerId) })
      .exec();
  }

  async findById(id: Types.ObjectId | string): Promise<VehicleDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async existsByLicensePlate(licensePlate: string): Promise<boolean> {
    const found = await this.model
      .exists({ license_plate: licensePlate })
      .exec();
    return found !== null;
  }

  async existsByLicensePlateExcept(
    licensePlate: string,
    excludeId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await this.model
      .exists({ license_plate: licensePlate, _id: { $ne: excludeId } })
      .exec();
    return found !== null;
  }

  async create(input: ICreateVehicleInput): Promise<VehicleDocument> {
    return this.model.create({
      customer_id: input.customerId,
      vehicle_type_id: input.vehicleTypeId,
      license_plate: input.licensePlate,
      nickname: input.nickname,
      brand: input.brand,
      car_model: input.carModel,
      color: input.color,
      is_default: input.isDefault ?? false,
    });
  }

  /**
   * Hard delete. Used to roll back a vehicle that was created inline during
   * a booking that then failed - soft delete would leave the license plate
   * permanently reserved and block the customer from retrying.
   */
  async deleteById(id: Types.ObjectId | string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model.findByIdAndDelete(id).exec();
  }

  async updateById(
    id: Types.ObjectId | string,
    input: IUpdateVehicleInput,
  ): Promise<VehicleDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.vehicleTypeId !== undefined)
      update.vehicle_type_id = input.vehicleTypeId;
    if (input.licensePlate !== undefined)
      update.license_plate = input.licensePlate;
    if (input.nickname !== undefined) update.nickname = input.nickname;
    if (input.brand !== undefined) update.brand = input.brand;
    if (input.carModel !== undefined) update.car_model = input.carModel;
    if (input.color !== undefined) update.color = input.color;
    if (input.isDefault !== undefined) update.is_default = input.isDefault;
    if (input.isActive !== undefined) update.is_active = input.isActive;

    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  async unsetDefaultForOwner(
    customerId: Types.ObjectId | string,
    excludeId: Types.ObjectId | string,
  ): Promise<void> {
    await this.model
      .updateMany(
        {
          customer_id: new Types.ObjectId(customerId),
          _id: { $ne: excludeId },
          is_default: true,
        },
        { $set: { is_default: false } },
      )
      .exec();
  }

  async hasAnyActiveOwned(
    customerId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await this.model
      .exists({
        customer_id: new Types.ObjectId(customerId),
        is_active: true,
      })
      .exec();
    return found !== null;
  }

  /** Returns vehicle _ids whose license_plate contains the given substring (case-insensitive). */
  async findIdsByLicensePlateLike(
    plateLike: string,
  ): Promise<Types.ObjectId[]> {
    const term = plateLike.trim();
    if (term.length === 0) return [];
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await this.model
      .find({ license_plate: { $regex: escaped, $options: 'i' } })
      .select({ _id: 1 })
      .exec();
    return docs.map((d) => d._id);
  }

  async countMatching(filter: IVehicleListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
  }

  async findPaginated(
    filter: IVehicleListFilter,
    page: number,
    limit: number,
  ): Promise<VehicleDocument[]> {
    const skip = (page - 1) * limit;
    return this.model
      .find(this.buildQuery(filter))
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer_id', 'name phone email')
      .populate('vehicle_type_id', 'name')
      .exec();
  }

  private buildQuery(filter: IVehicleListFilter): VehicleQuery {
    const q: VehicleQuery = {};
    if (filter.customerId) q.customer_id = filter.customerId;
    if (filter.vehicleTypeId) q.vehicle_type_id = filter.vehicleTypeId;
    if (filter.isActive !== undefined) q.is_active = filter.isActive;
    if (filter.licensePlateLike) {
      const term = filter.licensePlateLike.trim();
      if (term.length > 0) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        q.license_plate = { $regex: escaped, $options: 'i' };
      }
    }
    return q;
  }
}
