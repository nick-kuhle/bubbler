// src/i18n/navigation.ts — locale-aware Link/router/pathname hooks bound to our routing.
import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
