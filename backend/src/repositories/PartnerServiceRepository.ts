import type Database from "better-sqlite3";

export interface PartnerServiceRow {
  id: string;
  name: string;
  category: string;
  short_description: string;
  premium_required: number;
  marketplace_status: string;
}

export interface PartnerService {
  id: string;
  name: string;
  category: string;
  short_description: string;
  premium_required: boolean;
  marketplace_status: string;
}

export class PartnerServiceRepository {
  constructor(private readonly db: Database.Database) {}

  findAll(): PartnerService[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, category, short_description, premium_required, marketplace_status
         FROM partner_services
         ORDER BY name ASC`,
      )
      .all() as PartnerServiceRow[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      short_description: r.short_description,
      premium_required: r.premium_required === 1,
      marketplace_status: r.marketplace_status,
    }));
  }
}
