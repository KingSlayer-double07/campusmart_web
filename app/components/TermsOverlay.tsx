"use client";

import DocumentOverlay from "./DocumentOverlay";
import LegalDocumentBody from "./LegalDocumentBody";
import { legalDateLabel, TERMS } from "@/lib/constants/legal";

interface TermsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export default function TermsOverlay({ isOpen, onClose, onAccept }: TermsOverlayProps) {
  return (
    <DocumentOverlay
      isOpen={isOpen}
      onClose={onClose}
      onAccept={onAccept}
      title="Terms & Conditions"
      effectiveDate={legalDateLabel()}
    >
      <LegalDocumentBody doc={TERMS} />
    </DocumentOverlay>
  );
}
