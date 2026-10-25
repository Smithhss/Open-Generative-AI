"use client";

import { useState, useEffect } from 'react';
import { CreativeCanvas } from 'design-agent';

import { getUserBalance } from '../muapi';

export default function DesignAgentStudio({
  apiKey,
  locale = 'en',
  userEmail,
  userId = null,
  balance,
  isHeaderVisible,
  onToggleHeader,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
  // fyt 本地画布：透传给 CreativeCanvas，素材不上传、项目文件本地保存。
  authToken = null,
  localCanvas = false,
  active = true,
  onLocalFiles = null,
  isLocalSource = null,
  onLocalClear = null,
  onProjectDirtyChange = null,
  canvasApiRef = null,
  toolbarExtra = null,
  resolveAsset = null,
  fytTicket = null,
  fytTicketExpiresAt = 0,
}) {
  const [userData, setUserData] = useState(null);

  // Legacy BYOK mode retains its existing storage contract. FYT credentials
  // remain in memory and reach the canvas only through the ticket prop.
  if (!localCanvas && apiKey && typeof window !== 'undefined') {
    sessionStorage.setItem("fromDesignAgent", "true");
    localStorage.setItem("token", apiKey);
  }

  useEffect(() => {
    // fyt 模式没有 MuAPI key：只要外层给了用户身份，也要初始化，否则画布会停在未授权态。
    if (!apiKey && userEmail === undefined && balance === undefined) return;

    // White-label shells already know the end user's identity/credit balance (fetched via
    // /api/whitelabel/balance) and pass them in directly — GET /account/balance explicitly
    // 403s for white-label end users, so getUserBalance() below must stay BYOK-only.
    if (userEmail !== undefined || balance !== undefined) {
      setUserData({
        username: userEmail?.split('@')[0] || 'Studio User',
        email: userEmail,
        balance: balance || 0,
      });
      return;
    }

    const fetchUser = async () => {
      try {
        const data = await getUserBalance(apiKey);
        setUserData({
          username: data.email?.split('@')[0] || 'Studio User',
          email: data.email,
          balance: data.balance || 0
        });
      } catch (err) {
        console.error('Failed to fetch user data for Design Agent:', err);
      }
    };

    fetchUser();
  }, [apiKey, userEmail, balance]);

  return (
    <div className="h-full w-full bg-black overflow-hidden design-agent-studio">
      <CreativeCanvas 
        locale={locale}
        user={userData}
        fytUserId={userId}
        isAuthorized={!!userData}
        creditConversionRate={200}
        theme="dark"
        onToggleHeader={onToggleHeader}
        isHeaderVisible={isHeaderVisible}
        onGenerationStart={onGenerationStart}
        onGenerationEnd={onGenerationEnd}
        onGenerationComplete={onGenerationComplete}
        onGenerationError={onGenerationError}
        localCanvas={localCanvas}
        active={active}
        onLocalFiles={onLocalFiles}
        isLocalSource={isLocalSource}
        onLocalClear={onLocalClear}
        onProjectDirtyChange={onProjectDirtyChange}
        canvasApiRef={canvasApiRef}
        toolbarExtra={toolbarExtra}
        resolveAsset={resolveAsset}
        fytTicket={fytTicket}
        fytTicketExpiresAt={fytTicketExpiresAt}
      />
    </div>
  );
}
