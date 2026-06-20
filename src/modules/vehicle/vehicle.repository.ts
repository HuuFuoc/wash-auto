import { Types } from 'mongoose';
import { VehicleDocument, VehicleModel } from './vehicle.model';

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
  /** Broad search across plate, nickname, brand, model. */
  searchLike?: string;
  isActive?: boolean;
}

export type VehicleSortField =
  | 'license_plate'
  | 'customer_name'
  | 'vehicle_type_name'
  | 'created_at'
  | 'updated_at'
  | 'usage_count'
  | 'is_active';

export interface IVehicleSort {
  field: VehicleSortField;
  order: 1 | -1;
}

/** A vehicle row enriched with owner/type names and lifetime usage count. */
export type VehicleListRow = VehicleDocument & { usage_count: number };

export class VehicleRepository {
  async findByOwner(
    customerId: Types.ObjectId | string,
    includeInactive = false,
  ): Promise<VehicleDocument[]> {
    const query: VehicleQuery = { customer_id: new Types.ObjectId(customerId) };
    if (!includeInactive) query.is_active = true;
    return VehicleModel.find(query)
      .sort({ is_default: -1, created_at: -1 })
      .exec();
  }

  async findByIdForOwner(
    id: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
  ): Promise<VehicleDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VehicleModel.findOne({
      _id: id,
      customer_id: new Types.ObjectId(customerId),
    }).exec();
  }

  async findById(id: Types.ObjectId | string): Promise<VehicleDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VehicleModel.findById(id).exec();
  }

  async existsByLicensePlate(licensePlate: string): Promise<boolean> {
    const found = await VehicleModel.exists({
      license_plate: licensePlate,
    }).exec();
    return found !== null;
  }

  async existsByLicensePlateExcept(
    licensePlate: string,
    excludeId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await VehicleModel.exists({
      license_plate: licensePlate,
      _id: { $ne: excludeId },
    }).exec();
    return found !== null;
  }

  async create(input: ICreateVehicleInput): Promise<VehicleDocument> {
    return VehicleModel.create({
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
    await VehicleModel.findByIdAndDelete(id).exec();
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

    return VehicleModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  async unsetDefaultForOwner(
    customerId: Types.ObjectId | string,
    excludeId: Types.ObjectId | string,
  ): Promise<void> {
    await VehicleModel.updateMany(
      {
        customer_id: new Types.ObjectId(customerId),
        _id: { $ne: excludeId },
        is_default: true,
      },
      { $set: { is_default: false } },
    ).exec();
  }

  async hasAnyActiveOwned(
    customerId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await VehicleModel.exists({
      customer_id: new Types.ObjectId(customerId),
      is_active: true,
    }).exec();
    return found !== null;
  }

  /** Returns vehicle _ids whose license_plate contains the given substring (case-insensitive). */
  async findIdsByLicensePlateLike(
    plateLike: string,
  ): Promise<Types.ObjectId[]> {
    const term = plateLike.trim();
    if (term.length === 0) return [];
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await VehicleModel.find({
      license_plate: { $regex: escaped, $options: 'i' },
    })
      .select({ _id: 1 })
      .exec();
    return docs.map((d) => d._id);
  }

  async countMatching(filter: IVehicleListFilter): Promise<number> {
    return VehicleModel.countDocuments(this.buildQuery(filter)).exec();
  }

  async findPaginated(
    filter: IVehicleListFilter,
    page: number,
    limit: number,
  ): Promise<VehicleDocument[]> {
    const skip = (page - 1) * limit;
    return VehicleModel.find(this.buildQuery(filter))
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer_id', 'name phone email')
      .populate('vehicle_type_id', 'name')
      .exec();
  }

  /**
   * Admin list with server-side sort across stored + derived columns
   * (owner name, vehicle-type name, and lifetime service-usage count). Returns
   * rows shaped like a populated VehicleDocument plus `usage_count`.
   */
  async findPaginatedSorted(
    filter: IVehicleListFilter,
    page: number,
    limit: number,
    sort: IVehicleSort,
  ): Promise<VehicleListRow[]> {
    const skip = (page - 1) * limit;
    const sortStage: Record<string, 1 | -1> = {
      [sort.field]: sort.order,
      _id: 1, // stable tiebreaker for deterministic pagination
    };

    return VehicleModel.aggregate<VehicleListRow>([
      { $match: this.buildQuery(filter) },
      {
        $lookup: {
          from: 'users',
          localField: 'customer_id',
          foreignField: '_id',
          as: '_cust',
        },
      },
      {
        $lookup: {
          from: 'vehicle_types',
          localField: 'vehicle_type_id',
          foreignField: '_id',
          as: '_vtype',
        },
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'vehicle_id',
          as: '_orders',
        },
      },
      {
        $addFields: {
          usage_count: { $size: '$_orders' },
          customer_name: { $first: '$_cust.name' },
          vehicle_type_name: { $first: '$_vtype.name' },
          customer_id: {
            _id: '$customer_id',
            name: { $first: '$_cust.name' },
            phone: { $first: '$_cust.phone' },
          },
          vehicle_type_id: {
            _id: '$vehicle_type_id',
            name: { $first: '$_vtype.name' },
          },
        },
      },
      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit },
      { $project: { _cust: 0, _vtype: 0, _orders: 0 } },
    ]).exec();
  }

  private buildQuery(filter: IVehicleListFilter): Record<string, unknown> {
    const q: Record<string, unknown> = {};
    if (filter.customerId) q.customer_id = filter.customerId;
    if (filter.vehicleTypeId) q.vehicle_type_id = filter.vehicleTypeId;
    if (filter.isActive !== undefined) q.is_active = filter.isActive;
    if (filter.licensePlateLike) {
      const term = filter.licensePlateLike.trim();
      if (term.length > 0) {
        q.license_plate = { $regex: escapeRegex(term), $options: 'i' };
      }
    }
    if (filter.searchLike) {
      const term = filter.searchLike.trim();
      if (term.length > 0) {
        const rx = { $regex: escapeRegex(term), $options: 'i' };
        q.$or = [
          { license_plate: rx },
          { nickname: rx },
          { brand: rx },
          { car_model: rx },
        ];
      }
    }
    return q;
  }
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
