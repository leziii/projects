import { Module } from '@nestjs/common';
import { PetCheckController } from './pet-check.controller';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';

@Module({ controllers: [PetsController, PetCheckController], providers: [PetsService], exports: [PetsService] })
export class PetsModule {}
