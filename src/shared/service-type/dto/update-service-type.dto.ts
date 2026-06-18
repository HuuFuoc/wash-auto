import { PartialType } from '../../../common/swagger-shim';
import { CreateServiceTypeDto } from './create-service-type.dto';

export class UpdateServiceTypeDto extends PartialType(CreateServiceTypeDto) {}
