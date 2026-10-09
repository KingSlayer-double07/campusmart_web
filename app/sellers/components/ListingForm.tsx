"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import InfoBanner from "@/app/components/InfoBanner";
import { ApiError } from "@/lib/api/client";
import { CATEGORY_LABELS, CONDITION_LABELS, type ListingCategory, type ProductCondition } from "@/lib/labels";
import { uploadImages, type UploadedImage } from "@/lib/uploads";
import {
  MAX_OPTIONS,
  MAX_PHOTOS,
  emptyOption,
  newKey,
  validateListingForm,
  type ListingFields,
  type ListingFormErrors,
  type ListingFormValues,
  type OptionRow,
  type PhotoSlot,
} from "./listingFormModel";

const inputClass =
  "w-full bg-surface-muted border border-border-default rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-seller-main/30 focus:border-seller-main transition disabled:opacity-60";

export type SubmitIntent = "DRAFT" | "ACTIVE" | "SAVE";

interface ListingFormProps {
  initialValues: ListingFormValues;
  /** "create" shows Save as draft + Publish; "edit" shows Save changes */
  mode: "create" | "edit";
  onSubmit: (fields: ListingFields, images: UploadedImage[], intent: SubmitIntent) => Promise<void>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs font-medium text-red-500">
      {message}
    </p>
  );
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <>
      <section className={`px-4 py-5 flex flex-col gap-1.5 ${className}`}>{children}</section>
      <div className="h-2 bg-surface-muted" />
    </>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  placeholder,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: T | "";
  options: Record<T, string>;
  placeholder: string;
  error?: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          aria-invalid={!!error || undefined}
          className={`${inputClass} appearance-none pr-10 bg-card ${error ? "border-red-400" : ""}`}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {(Object.entries(options) as [T, string][]).map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted pointer-events-none" />
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

// Add product (guide 3.2.6) and its edit mode at /sellers/products/[id]/edit share this form
export default function ListingForm({ initialValues, mode, onSubmit }: ListingFormProps) {
  const [values, setValues] = useState<ListingFormValues>(initialValues);
  const [errors, setErrors] = useState<ListingFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<SubmitIntent | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previews = useRef<string[]>([]);

  // Free the photo previews when the form goes away
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const set = <K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - values.photos.length;
    const added: PhotoSlot[] = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, room)
      .map((file) => {
        const previewUrl = URL.createObjectURL(file);
        previews.current.push(previewUrl);
        return { key: newKey(), kind: "new", file, previewUrl };
      });
    set("photos", [...values.photos, ...added]);
  };

  const removePhoto = (key: string) => set("photos", values.photos.filter((p) => p.key !== key));

  const setOption = (key: string, patch: Partial<OptionRow>) => {
    setValues((v) => ({ ...v, options: v.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) }));
    setErrors((e) => ({ ...e, options: undefined, optionRows: { ...e.optionRows, [key]: "" } }));
  };

  const submit = async (intent: SubmitIntent) => {
    const { errors: found, fields } = validateListingForm(values);
    setErrors(found);
    setFormError(null);
    if (!fields) {
      setFormError("Some details need fixing. They're marked in red.");
      return;
    }

    setBusy(intent);
    try {
      // Guide 3.2.6a: get a signature, upload each new photo straight to Cloudinary, then save
      const newPhotos = values.photos.filter((p): p is Extract<PhotoSlot, { kind: "new" }> => p.kind === "new");
      const uploaded = await uploadImages(
        newPhotos.map((p) => p.file),
        "LISTING",
        (index, fraction) => setProgress((prev) => ({ ...prev, [newPhotos[index].key]: fraction })),
      );
      const byKey = new Map(newPhotos.map((p, i) => [p.key, uploaded[i]]));
      const images = values.photos.map((p) => (p.kind === "existing" ? { url: p.url, publicId: p.publicId } : byKey.get(p.key)!));
      // Uploaded photos become saved ones, so a retry doesn't upload them again
      setValues((v) => ({
        ...v,
        photos: v.photos.map((p) => {
          const done = byKey.get(p.key);
          return done ? { key: p.key, kind: "existing", url: done.url, publicId: done.publicId } : p;
        }),
      }));
      await onSubmit(fields, images, intent);
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_IMAGE") {
        setErrors((e) => ({ ...e, photos: err.message }));
        setFormError(err.message);
      } else if (err instanceof ApiError && err.code === "UPLOADS_NOT_CONFIGURED") {
        setFormError("Photo uploads aren't set up yet, so listings can't be saved. Please try again later.");
      } else {
        setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(null);
      setProgress({});
    }
  };

  const uploading = busy !== null && Object.keys(progress).length > 0;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit(mode === "edit" ? "SAVE" : "ACTIVE");
      }}
      className="flex flex-col"
    >
      {/* Photos */}
      <Section className="gap-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-sm text-foreground">Product photos</p>
            <p className="text-foreground-muted text-xs mt-0.5">Add 1 to {MAX_PHOTOS}. The first one is the cover.</p>
          </div>
          <p className="text-foreground-muted text-xs">
            {values.photos.length}/{MAX_PHOTOS}
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {values.photos.map((photo, i) => {
            const fraction = progress[photo.key];
            return (
              <div key={photo.key} className="relative w-24 h-24 rounded-xl overflow-hidden border border-border-default shrink-0 bg-surface-muted">
                <Image
                  src={photo.kind === "new" ? photo.previewUrl : photo.url}
                  alt={`Photo ${i + 1}`}
                  fill
                  sizes="96px"
                  unoptimized={photo.kind === "new"}
                  className="object-cover"
                />
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white">Cover</span>
                )}
                {fraction !== undefined && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white">
                    {Math.round(fraction * 100)}%
                  </div>
                )}
                {!busy && (
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => removePhoto(photo.key)}
                    className="absolute top-1 right-1 size-5 bg-black/60 rounded-full flex items-center justify-center"
                  >
                    <X size={11} className="text-white" />
                  </button>
                )}
              </div>
            );
          })}
          {values.photos.length < MAX_PHOTOS && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => fileInput.current?.click()}
              className="w-24 h-24 rounded-xl border-2 border-dashed border-border-default flex flex-col items-center justify-center gap-1 shrink-0 transition hover:border-seller-main hover:bg-seller-main/5 bg-card"
            >
              <div className="size-7 rounded-full bg-surface-muted flex items-center justify-center">
                <Plus size={16} className="text-foreground-muted" />
              </div>
              <p className="text-foreground-muted text-[10px] font-medium">Add photo</p>
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label="Choose photos"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <FieldError id="photos-error" message={errors.photos} />
      </Section>

      {/* Name and description */}
      <Section>
        <label htmlFor="listing-title" className="text-sm font-semibold text-foreground">
          Product name
        </label>
        <input
          id="listing-title"
          value={values.title}
          maxLength={120}
          onChange={(e) => set("title", e.target.value)}
          placeholder="What are you selling?"
          aria-invalid={!!errors.title || undefined}
          className={`${inputClass} ${errors.title ? "border-red-400" : ""}`}
        />
        <FieldError id="title-error" message={errors.title} />

        <label htmlFor="listing-description" className="mt-4 text-sm font-semibold text-foreground">
          Description
        </label>
        <textarea
          id="listing-description"
          value={values.description}
          maxLength={2000}
          rows={5}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Size, colour, what's included, any wear"
          className={`${inputClass} resize-none`}
        />
        <p className="text-right text-[11px] text-foreground-muted">{values.description.length}/2000</p>
        <FieldError id="description-error" message={errors.description} />
      </Section>

      {/* Price and stock */}
      <Section className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="listing-price" className="text-sm font-semibold text-foreground">
            Price
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm font-medium">₦</span>
            <input
              id="listing-price"
              inputMode="decimal"
              value={values.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="0"
              aria-invalid={!!errors.price || undefined}
              className={`${inputClass} pl-7 ${errors.price ? "border-red-400" : ""}`}
            />
          </div>
          <FieldError id="price-error" message={errors.price} />
        </div>
        {!values.hasOptions && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="listing-stock" className="text-sm font-semibold text-foreground">
              Quantity in stock
            </label>
            <input
              id="listing-stock"
              inputMode="numeric"
              value={values.stock}
              onChange={(e) => set("stock", e.target.value)}
              aria-invalid={!!errors.stock || undefined}
              className={`${inputClass} ${errors.stock ? "border-red-400" : ""}`}
            />
            <FieldError id="stock-error" message={errors.stock} />
          </div>
        )}
      </Section>

      {/* Category and condition */}
      <Section className="grid grid-cols-2 gap-4">
        <SelectField<ListingCategory>
          id="listing-category"
          label="Category"
          value={values.category}
          options={CATEGORY_LABELS}
          placeholder="Choose"
          error={errors.category}
          onChange={(v) => set("category", v)}
        />
        <SelectField<ProductCondition>
          id="listing-condition"
          label="Condition"
          value={values.condition}
          options={CONDITION_LABELS}
          placeholder="Choose"
          error={errors.condition}
          onChange={(v) => set("condition", v)}
        />
      </Section>

      {/* Sizes or options (guide 3.2.6e) */}
      <Section className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Sizes or options</p>
            <p className="text-xs text-foreground-muted">For items that come in sizes, colours or volumes</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={values.hasOptions}
            aria-label="This item has sizes or options"
            onClick={() => set("hasOptions", !values.hasOptions)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-300 ${
              values.hasOptions ? "bg-seller-main" : "bg-neutral-300"
            }`}
          >
            <span
              className={`inline-block size-5 transform rounded-full bg-card shadow-md transition-transform duration-300 ${
                values.hasOptions ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {values.hasOptions && (
          <>
            <div className="grid grid-cols-[1fr_6rem_4.5rem_2rem] gap-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              <span>Option</span>
              <span>Price (₦)</span>
              <span>Stock</span>
              <span />
            </div>
            {values.options.map((row, i) => (
              <div key={row.key} className="flex flex-col gap-1">
                <div className="grid grid-cols-[1fr_6rem_4.5rem_2rem] gap-2 items-center">
                  <input
                    aria-label={`Option ${i + 1} name`}
                    value={row.label}
                    maxLength={40}
                    onChange={(e) => setOption(row.key, { label: e.target.value })}
                    placeholder="e.g. M or Black / XL"
                    className={`${inputClass} px-3 py-2.5`}
                  />
                  <input
                    aria-label={`Option ${i + 1} price`}
                    inputMode="decimal"
                    value={row.price}
                    onChange={(e) => setOption(row.key, { price: e.target.value })}
                    placeholder="Same"
                    className={`${inputClass} px-3 py-2.5`}
                  />
                  <input
                    aria-label={`Option ${i + 1} stock`}
                    inputMode="numeric"
                    value={row.stock}
                    onChange={(e) => setOption(row.key, { stock: e.target.value })}
                    placeholder="0"
                    className={`${inputClass} px-3 py-2.5`}
                  />
                  <button
                    type="button"
                    aria-label={`Remove option ${i + 1}`}
                    onClick={() => set("options", values.options.filter((o) => o.key !== row.key))}
                    className="flex size-8 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <FieldError id={`option-${row.key}-error`} message={errors.optionRows?.[row.key] || undefined} />
              </div>
            ))}
            {values.options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={() => set("options", [...values.options, emptyOption()])}
                className="flex items-center gap-1 self-start text-sm font-semibold text-seller-main"
              >
                <Plus size={16} />
                Add option
              </button>
            )}
            <p className="text-xs text-foreground-muted">Leave the price empty to use the main price. Stock is counted per option.</p>
            <FieldError id="options-error" message={errors.options} />
          </>
        )}
      </Section>

      {formError && (
        <div className="px-4 pt-4">
          <InfoBanner variant="error" text={formError} />
        </div>
      )}

      {/* Actions */}
      <section className="flex flex-col gap-3 px-4 py-6">
        {uploading && <p className="text-center text-xs text-foreground-muted">Uploading photos… keep this page open</p>}
        {mode === "create" ? (
          <>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => submit("ACTIVE")}
              className="w-full py-4 rounded-full bg-seller-main text-white font-bold text-sm hover:bg-seller-hover active:scale-[0.98] transition-all shadow-md disabled:opacity-60"
            >
              {busy === "ACTIVE" ? "Publishing…" : "Publish"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => submit("DRAFT")}
              className="w-full py-4 rounded-full bg-card border border-border-default text-foreground font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {busy === "DRAFT" ? "Saving…" : "Save as draft"}
            </button>
          </>
        ) : (
          <button
            type="submit"
            disabled={!!busy}
            className="w-full py-4 rounded-full bg-seller-main text-white font-bold text-sm hover:bg-seller-hover active:scale-[0.98] transition-all shadow-md disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        )}
      </section>
    </form>
  );
}
