import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/error-message";
import { SelectField } from "@/components/select-field";
import { TextField } from "@/components/text-field";
import { api } from "@/lib/api";
import { useLedger } from "@/lib/state";
import { type Service } from "@/lib/report-types";

export function ServiceEditor({
  service,
  done,
}: {
  service?: Service;
  done: () => void;
}) {
  const [vendor, setVendor] = useState(service?.vendor || ""),
    [category, setCategory] = useState(service?.category || ""),
    [cadence, setCadence] = useState(service?.cadence || "monthly"),
    [cost, setCost] = useState(String((service?.cost_cents || 0) / 100)),
    [decision, setDecision] = useState(service?.decision || "review"),
    [confirmed, setConfirmed] = useState(service?.confirmed || false);
  const { bootstrap } = useLedger();
  const mutation = useMutation({
    mutationFn: () =>
      api("/api/reports/savings/service", {
        method: "PUT",
        body: {
          vendor: vendor.trim(),
          category,
          cadence,
          cost_cents: Math.round(Number(cost) * 100),
          decision,
          confirmed,
        },
      }),
    onSuccess: done,
  });
  return (
    <form
      className="report-editor"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h2 className="text-lg font-semibold">
        {service ? `Edit ${service.vendor}` : "Add subscription"}
      </h2>
      <p className="text-sm text-muted-foreground">
        Use the exact vendor name from your transactions to match historical
        spending. Decisions apply across accounts and report periods.
      </p>
      <div className="report-filters">
        {service ? (
          <p>{vendor}</p>
        ) : (
          <TextField
            id="service-vendor"
            label="Vendor"
            value={vendor}
            onChange={setVendor}
            required
            maxLength={200}
          />
        )}
        <SelectField
          id="service-category"
          label="Category"
          values={bootstrap.categories}
          empty="Choose category"
          value={category}
          onChange={setCategory}
        />
        <SelectField
          id="service-cadence"
          label="Cadence"
          values={["monthly", "annual"]}
          value={cadence}
          onChange={setCadence}
        />
        <TextField
          id="service-cost"
          label="Cost per charge ($)"
          type="number"
          step="0.01"
          value={cost}
          onChange={setCost}
          required
        />
        <SelectField
          id="service-decision"
          label="Decision"
          values={["keep", "review", "cancel"]}
          value={decision}
          onChange={setDecision}
        />
      </div>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Confirmed recurring service and cost
      </label>
      <div className="flex gap-3">
        <Button
          disabled={
            mutation.isPending ||
            !vendor.trim() ||
            !Number.isFinite(Number(cost)) ||
            Number(cost) < 0
          }
        >
          Save subscription
        </Button>
        <Button type="button" variant="outline" onClick={done}>
          Close
        </Button>
      </div>
      <ErrorMessage error={mutation.error} />
    </form>
  );
}
