"use client";

import React from "react";
import { FileText } from "lucide-react";
import Button from "./Button";
import Modal from "./Modal";

interface DocumentOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}

export default function DocumentOverlay({
  isOpen,
  onClose,
  onAccept,
  title,
  effectiveDate,
  children,
}: DocumentOverlayProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Decline
          </Button>
          <Button onClick={onAccept} className="flex-1">
            Accept
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-foreground-muted font-bold text-[12px] uppercase tracking-wider mb-1">
            <FileText size={16} className="text-foreground-muted" />
            <span>Legal Document</span>
          </div>
          <p className="text-foreground-muted text-[15px] font-semibold mb-4">CampusMart</p>

          <p className="text-foreground-muted text-[14px] mb-6">
            Effective Date: <span className="text-foreground font-semibold">{effectiveDate}</span>
          </p>
        </div>
        {children}
      </div>
    </Modal>
  );
}
