"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitAddressAction, type AddressFormState } from "./actions";

interface Props {
  defaults: {
    email?: string;
    first_name?: string;
    last_name?: string;
    address_1?: string;
    address_2?: string;
    postal_code?: string;
    city?: string;
    phone?: string;
  };
  hasSavedAddress: boolean;
}

const initial: AddressFormState = {};

export function AddressForm({ defaults, hasSavedAddress }: Props) {
  const [state, action] = useFormState(submitAddressAction, initial);
  const errs = state.fieldErrors ?? {};

  return (
    <form action={action} aria-label="Lieferadresse" noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vorname" name="first_name" defaultValue={defaults.first_name} error={errs.first_name} autoComplete="given-name" required />
        <Field label="Nachname" name="last_name" defaultValue={defaults.last_name} error={errs.last_name} autoComplete="family-name" required />
      </div>
      <Field label="E-Mail" name="email" type="email" defaultValue={defaults.email} error={errs.email} autoComplete="email" required />
      <Field label="Straße und Hausnummer" name="address_1" defaultValue={defaults.address_1} error={errs.address_1} autoComplete="address-line1" required />
      <Field label="Adresszusatz (optional)" name="address_2" defaultValue={defaults.address_2} autoComplete="address-line2" />
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field label="PLZ" name="postal_code" defaultValue={defaults.postal_code} error={errs.postal_code} autoComplete="postal-code" inputMode="numeric" pattern="\d{5}" required />
        <Field label="Stadt" name="city" defaultValue={defaults.city} error={errs.city} autoComplete="address-level2" required />
      </div>
      <Field label="Telefon (optional)" name="phone" type="tel" defaultValue={defaults.phone} autoComplete="tel" />

      <div className="flex items-center gap-2 font-body text-sm text-binchen-ink-muted">
        <span aria-hidden="true">🇩🇪</span>
        <span>Versand derzeit nur innerhalb Deutschlands.</span>
      </div>

      {state.error ? (
        <p role="alert" className="font-body text-sm text-binchen-terracotta-text">
          {state.error}
        </p>
      ) : null}

      <SubmitButton hasSavedAddress={hasSavedAddress} />
    </form>
  );
}

function SubmitButton({ hasSavedAddress }: { hasSavedAddress: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" size="lg" disabled={pending}>
      {pending ? "Wird gespeichert…" : hasSavedAddress ? "Adresse aktualisieren" : "Weiter zum Versand"}
    </Button>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  pattern?: string;
}

function Field({ label, name, type = "text", defaultValue, error, required, autoComplete, inputMode, pattern }: FieldProps) {
  const id = `f-${name}`;
  const errId = `${id}-err`;
  return (
    <div>
      <label htmlFor={id} className="block font-body text-sm font-medium text-binchen-ink">
        {label}
        {required ? <span className="ml-1 text-binchen-terracotta-text" aria-hidden="true">*</span> : null}
      </label>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        pattern={pattern}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errId : undefined}
        className="mt-1"
      />
      {error ? (
        <p id={errId} role="alert" className="mt-1 font-body text-xs text-binchen-terracotta-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
