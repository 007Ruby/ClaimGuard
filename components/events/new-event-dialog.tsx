"use client";

import { useState } from "react";
import { createEvent } from "@/lib/actions/events";
import { EVENT_TYPE_LABELS, EVENT_TYPE_OPTIONS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

export function NewEventDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New event</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
        </DialogHeader>
        <form action={createEvent} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required
                   placeholder="e.g. Drawings revision delayed" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <select id="type" name="type" defaultValue="other"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
              {EVENT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="occurred_on">Date it occurred</Label>
            <Input id="occurred_on" name="occurred_on" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description"
                      placeholder="What happened?" rows={3} />
          </div>
          <DialogFooter>
            <Button type="submit">Create event</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}