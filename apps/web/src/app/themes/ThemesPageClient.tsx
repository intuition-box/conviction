"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useAccount } from "wagmi";

import { Button } from "@/components/Button/Button";
import { AtomSuggestionInput } from "@/components/AtomSuggestionInput/AtomSuggestionInput";
import { useCreateTheme } from "@/features/theme/useCreateTheme";

import styles from "./ThemesPageClient.module.css";

export function ThemesPageClient() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { isCreating, error, createTheme } = useCreateTheme();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [lockedAtomId, setLockedAtomId] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    const result = await createTheme(name, description, lockedAtomId);
    if (result) {
      setDialogOpen(false);
      setName("");
      setLockedAtomId(null);
      setDescription("");
      router.push(`/themes/${result.slug}`);
    }
  }

  const handleLock = useCallback((atomId: string, label: string) => {
    setLockedAtomId(atomId);
    setName(label);
  }, []);

  const handleUnlock = useCallback(() => {
    setLockedAtomId(null);
  }, []);

  const handleCreateNew = useCallback((_label: string) => {
    // Keep the typed text, lockedAtomId stays null → new atom will be created on-chain
  }, []);

  if (!isConnected) return null;

  return (
    <>
      <Button variant="primary" onClick={() => setDialogOpen(true)}>
        New theme
      </Button>

      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.content}>
            <div className={styles.header}>
              <Dialog.Title className={styles.title}>Create a theme</Dialog.Title>
              <Dialog.Close asChild>
                <button className={styles.closeButton} aria-label="Close">
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className={styles.body}>
              <div className={styles.field}>
                <span className={styles.label}>Name</span>
                <AtomSuggestionInput
                  id="theme-name"
                  label="Theme name"
                  value={name}
                  lockedAtomId={lockedAtomId}
                  placeholder="e.g. Climate Change"
                  onChange={setName}
                  onLock={handleLock}
                  onUnlock={handleUnlock}
                  onCreateNew={handleCreateNew}
                />
              </div>

              <label className={styles.label}>
                Description (optional)
                <textarea
                  className={styles.textarea}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A short description of the debate topic..."
                  maxLength={500}
                  rows={3}
                />
              </label>

              {error && <p className={styles.error}>{error}</p>}

              <p className={styles.hint}>
                {lockedAtomId
                  ? "This atom already exists on-chain."
                  : "This will create an on-chain atom for the theme. A wallet signature is required."}
              </p>
            </div>

            <div className={styles.footer}>
              <Button
                variant="secondary"
                onClick={() => setDialogOpen(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={!name.trim() || isCreating}
              >
                {isCreating ? "Creating..." : "Create"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
