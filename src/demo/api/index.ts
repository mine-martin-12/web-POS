import type { DataApi } from "@/data/types";
import { account } from "./account";
import { activity } from "./activity";
import { approvals } from "./approvals";
import { credits } from "./credits";
import { customers } from "./customers";
import { expenses } from "./expenses";
import { messaging } from "./messaging";
import { notifications } from "./notifications";
import { products } from "./products";
import { realtime } from "./realtime";
import { sales } from "./sales";
import { staff } from "./staff";

/** Every backend call, answered by the in-browser demo database. */
export const demoApi = {
  account,
  activity,
  approvals,
  credits,
  customers,
  expenses,
  messaging,
  notifications,
  products,
  realtime,
  sales,
  staff,
} satisfies DataApi;
