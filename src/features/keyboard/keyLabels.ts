import { Mod } from "@/lib/types";

export const MODIFIER_BIT: Record<number, number> = {
  56: Mod.ShiftL,
  60: Mod.ShiftR,
  58: Mod.OptionL,
  61: Mod.OptionR,
  59: Mod.ControlL,
  62: Mod.ControlR,
  55: Mod.Command,
  54: Mod.Command,
  57: Mod.Caps,
};
