"use client";

import DocumentOverlay from "./DocumentOverlay";
import LegalDocumentBody from "./LegalDocumentBody";
import { legalDateLabel, PRIVACY } from "@/lib/constants/legal";

interface PrivacyPolicyOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export default function PrivacyPolicyOverlay({ isOpen, onClose, onAccept }: PrivacyPolicyOverlayProps) {
  return (
    <DocumentOverlay
      isOpen={isOpen}
      onClose={onClose}
      onAccept={onAccept}
      title="Privacy Policy"
      effectiveDate={legalDateLabel()}
    >
      <LegalDocumentBody doc={PRIVACY} />
    </DocumentOverlay>
  );
}
