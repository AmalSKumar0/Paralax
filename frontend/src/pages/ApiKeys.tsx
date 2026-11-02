import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../services/api';
import { ApiKey } from '../types';
import { Topbar } from '../components/Layout/Topbar';
import { Card } from '../components/Common/Card';
import { Button } from '../components/Common/Button';
import { Badge } from '../components/Common/Badge';
import { Modal } from '../components/Common/Modal';
import { ConfirmModal } from '../components/Common/ConfirmModal';
import { CopySnippet } from '../components/Common/CopySnippet';
import { useToast } from '../context/ToastContext';
import { formatRelativeTime, formatDateTime } from '../utils/formatters';
import { KeyRound, Plus, ShieldAlert, Trash2, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';

export const ApiKeys: React.FC = () => {
  const { onToggleMobileNav } = useOutletContext<{ onToggleMobileNav?: () => void }>() || {};
  const { success, error, warning } = useToast();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Create key modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Created secret dialog (shown ONCE)
  const [createdSecret, setCreatedSecret] = useState<{ key: ApiKey; secret: string } | null>(null);

  // Revoke confirmation modal
  const [revokeModal, setRevokeModal] = useState<{
    isOpen: boolean;
    keyId?: string;
    keyName?: string;
  }>({ isOpen: false });

  const fetchKeys = useCallback(async (isManual: boolean = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const data = await api.getApiKeys();
      setKeys(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve API keys';
      error(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [error]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) {
      error('Client application name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.createApiKey(keyName);
      setKeys((prev) => [res.key, ...prev]);
      setIsCreateOpen(false);
      setCreatedSecret(res);
      setKeyName('');
      success(`API key created for "${res.key.name}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate key';
      error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeModal.keyId) return;
    const { keyId } = revokeModal;
    setRevokeModal({ isOpen: false });

    try {
      await api.deleteApiKey(keyId);
      setKeys((prev) =>
        prev.map((k) => (k.id === keyId ? { ...k, status: 'revoked' } : k))
      );
      warning('API key has been revoked');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Revocation failed';
      error(msg);
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Topbar
        title="API Keys (Machine Clients)"
        subtitle="Manage cryptographic credentials for automated translation ingestion services"
        onRefresh={() => fetchKeys(true)}
        isRefreshing={isRefreshing}
        onToggleMobileNav={onToggleMobileNav}
      />

      <div className="p-6 md:p-8 space-y-6 w-full">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#2b1d16] tracking-tight">
              Active Machine Credentials
            </h2>
            <p className="text-xs text-[#8a776a]">
              Machine-to-machine client credentials attach via <code>x-api-key</code> or Bearer tokens
            </p>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Create API Key
          </Button>
        </div>

        {/* API Keys Table Card */}
        <div className="bg-white border border-[#ded7cc] rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#ded7cc] bg-[#f7f5f0] text-[11px] font-semibold uppercase tracking-wider text-[#736154]">
                  <th className="py-3.5 px-5">Client Name & ID</th>
                  <th className="py-3.5 px-4">Key Prefix</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created At</th>
                  <th className="py-3.5 px-4">Last Used</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ded7cc] text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#736154]">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#736154]" />
                        <span>Loading API keys...</span>
                      </div>
                    </td>
                  </tr>
                ) : keys.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#736154]">
                      No machine API keys provisioned yet.
                    </td>
                  </tr>
                ) : (
                  keys.map((k) => (
                    <tr key={k.id} className="hover:bg-[#f7f5f0] transition-colors">
                      {/* Name & ID */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg border border-[#ded7cc] bg-[#f7f5f0] flex items-center justify-center shrink-0">
                            <KeyRound className="w-4 h-4 text-[#736154]" />
                          </div>
                          <div>
                            <span className="font-semibold text-sm text-[#2b1d16] block">
                              {k.name}
                            </span>
                            <span className="font-mono text-[11px] text-[#8a776a]">
                              {k.id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Prefix */}
                      <td className="py-3.5 px-4 font-mono font-medium">
                        <span className="px-2 py-0.5 rounded border border-[#ded7cc] bg-[#f7f5f0] text-[#2b1d16]">
                          {k.key_prefix}••••••••
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {k.status === 'active' ? (
                          <Badge variant="success" size="sm" dot>Active</Badge>
                        ) : (
                          <Badge variant="danger" size="sm">Revoked</Badge>
                        )}
                      </td>

                      {/* Created */}
                      <td className="py-3.5 px-4 text-[#5c4a3e]">
                        {formatDateTime(k.created_at)}
                      </td>

                      {/* Last Used */}
                      <td className="py-3.5 px-4 text-[#5c4a3e]">
                        {k.last_used_at ? formatRelativeTime(k.last_used_at) : 'Never'}
                      </td>

                      {/* Revoke action */}
                      <td className="py-3.5 px-4 text-right">
                        {k.status === 'active' ? (
                          <button
                            onClick={() =>
                              setRevokeModal({
                                isOpen: true,
                                keyId: k.id,
                                keyName: k.name,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 font-medium text-xs transition-colors cursor-pointer"
                          >
                            Revoke
                          </button>
                        ) : (
                          <span className="text-[#8a776a] font-normal italic">Revoked</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Key Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Machine API Key" maxWidth="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="api-client-name-input" className="block text-xs font-semibold uppercase tracking-wider text-[#5c4a3e] mb-1.5">
              Client / Application Name *
            </label>
            <input
              id="api-client-name-input"
              type="text"
              required
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. Android Mobile App Gateway"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] text-sm text-[#2b1d16] focus:bg-white focus:border-[#e9b140] focus:ring-1 focus:ring-[#e9b140] focus:outline-none transition-all placeholder:text-[#8a776a]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Generate Secret Key
            </Button>
          </div>
        </form>
      </Modal>

      {/* Key Created Modal (Shown ONCE) */}
      {createdSecret && (
        <Modal
          isOpen={true}
          onClose={() => setCreatedSecret(null)}
          title="API Key Generated"
          maxWidth="md"
        >
          <div className="space-y-5">
            <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
              <span>
                Copy your secret key now. For security purposes, this secret key will never be visible again.
              </span>
            </div>

            <CopySnippet
              label="Secret Key"
              value={createdSecret.secret}
              isSecret
              downloadFilename={`${createdSecret.key.id}.env`}
              downloadContent={`PARALAX_API_KEY=${createdSecret.secret}\nCREATED_AT=${new Date().toISOString()}`}
            />

            <div className="pt-2 flex justify-end">
              <Button variant="primary" onClick={() => setCreatedSecret(null)}>
                I Have Saved This Key
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Revoke Confirmation Modal */}
      <ConfirmModal
        isOpen={revokeModal.isOpen}
        onClose={() => setRevokeModal({ isOpen: false })}
        onConfirm={handleRevoke}
        title={`Revoke ${revokeModal.keyName || 'API Key'}?`}
        message="Revoking this key immediately terminates machine access for any background service using it. This cannot be undone."
        confirmText="Revoke Key"
        variant="danger"
      />
    </div>
  );
};
