"use client";
// W0 SPIKE (throwaway): a dev-only measuring scene. In production this page renders nothing.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { parseWorldTest, type Opts } from "@/lib/worldtest";
const WorldTest = dynamic(() => import("@/components/WorldTest"), { ssr: false });

export default function Page() {
  const [o, setO] = useState<Opts | null>(null);
  useEffect(() => setO(parseWorldTest(window.location.search, process.env.NODE_ENV === "production")), []);
  return o ? <WorldTest {...o} /> : null;
}
