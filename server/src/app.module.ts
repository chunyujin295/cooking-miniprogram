import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { DatabaseModule } from './infra/database/database.module'
import { StorageModule } from './infra/storage/storage.module'
import { MediaModule } from './modules/media/media.module'
import { DietaryModule } from './modules/dietary/dietary.module'
import { ShoppingModule } from './modules/shopping/shopping.module'
import { AuthModule } from './modules/auth/auth.module'
import { HouseholdModule } from './modules/household/household.module'
import { RecipeModule } from './modules/recipe/recipe.module'
import { RecipeImportModule } from './modules/recipe-import/recipe-import.module'
import { MealModule } from './modules/meal/meal.module'
import { ProductionModule } from './modules/production/production.module'
import { ServingModule } from './modules/serving/serving.module'
import { PurchaseModule } from './modules/purchase/purchase.module'
import { NutritionModule } from './modules/nutrition/nutrition.module'
import { StatsModule } from './modules/stats/stats.module'
import { NotificationModule } from './modules/notification/notification.module'

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    MediaModule,
    DietaryModule,
    ShoppingModule,
    AuthModule,
    HouseholdModule,
    RecipeModule,
    RecipeImportModule,
    MealModule,
    ProductionModule,
    ServingModule,
    PurchaseModule,
    NutritionModule,
    StatsModule,
    NotificationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}