"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EngagementDetail } from "@/lib/client-relations/queries";
import type { ReactNode } from "react";

/**
 * One plot's three views.
 *
 * Radix Tabs rather than NavTabs: a plot's whole record — status, nine
 * milestones, its receipts and its Relay trails — is loaded by one server
 * query already, so switching panels should not be a round trip. That is
 * the plan-editor precedent, and the same reasoning.
 *
 * The panels arrive as children because two of the three are Server
 * Components; only the tab strip needs to be a Client Component.
 */
export function EngagementTabs({
  engagement,
  sale,
  design,
  collections,
}: {
  engagement: EngagementDetail;
  sale: ReactNode;
  design: ReactNode;
  collections: ReactNode;
}) {
  const outstanding = engagement.dues.outstanding > 0;

  return (
    <Tabs defaultValue="sale" className="space-y-4">
      <TabsList>
        <TabsTrigger value="sale">Sale &amp; agreement</TabsTrigger>
        <TabsTrigger value="design">Design &amp; site</TabsTrigger>
        <TabsTrigger value="collections">Collections{outstanding ? " & dues" : ""}</TabsTrigger>
      </TabsList>
      <TabsContent value="sale">{sale}</TabsContent>
      <TabsContent value="design">{design}</TabsContent>
      <TabsContent value="collections">{collections}</TabsContent>
    </Tabs>
  );
}
