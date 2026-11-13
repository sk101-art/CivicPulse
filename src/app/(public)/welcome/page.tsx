'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ShieldCheck,
  ArrowRight,
  Menu,
  X,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import styles from './welcome.module.css';

export default function WelcomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);

  const toggleArticle = (index: number) => {
    setExpandedArticle(expandedArticle === index ? null : index);
  };

  return (
    <div className={styles.welcomeRoot}>
      {/* ══════════════════════════════════════════════════════════════
          SECTION 1 — SITE HEADER
          ══════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#E0E0DF]">
        <div className={styles.container}>
          <div className="flex items-center justify-between h-[72px]">
            {/* Brand Logo & Wordmark */}
            <Link
              href="#top"
              className="flex items-center gap-3 group focus-visible:outline-2 focus-visible:outline-[#2E5BFF] focus-visible:outline-offset-2 rounded-md"
            >
              <div className="w-8 h-8 rounded-md bg-[#2E5BFF] flex items-center justify-center text-white font-bold text-sm tracking-tight shadow-xs">
                CP
              </div>
              <span className="text-[20px] font-semibold tracking-[-0.02em] text-[#201F20]">
                CivicPulse<span className="text-[#2E5BFF]">.</span>
              </span>
              <span className="hidden sm:inline-block font-mono text-[10px] font-medium uppercase tracking-[0.08em] px-2 py-0.5 rounded bg-[#F7F6F6] border border-[#E0E0DF] text-[#606060]">
                Bengaluru
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8" aria-label="Main Navigation">
              <a
                href="#about"
                className="text-[14px] font-medium text-[#494949] hover:text-[#201F20] transition-colors focus-visible:outline-2 focus-visible:outline-[#2E5BFF] rounded"
              >
                About
              </a>
              <a
                href="#how-it-works"
                className="text-[14px] font-medium text-[#494949] hover:text-[#201F20] transition-colors focus-visible:outline-2 focus-visible:outline-[#2E5BFF] rounded"
              >
                How It Works
              </a>
              <a
                href="#stats"
                className="text-[14px] font-medium text-[#494949] hover:text-[#201F20] transition-colors focus-visible:outline-2 focus-visible:outline-[#2E5BFF] rounded"
              >
                Impact
              </a>
              <a
                href="#team"
                className="text-[14px] font-medium text-[#494949] hover:text-[#201F20] transition-colors focus-visible:outline-2 focus-visible:outline-[#2E5BFF] rounded"
              >
                Team
              </a>
            </nav>

            {/* Header Actions */}
            <div className="hidden md:flex items-center gap-3">
              <Link
                href="/login"
                className="text-[14px] font-medium text-[#494949] hover:text-[#201F20] px-4 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-[#2E5BFF] rounded"
              >
                Citizen Login
              </Link>
              <Link
                href="/desk"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-full bg-[#F7F6F6] hover:bg-[#EFEFEF] border border-[#E0E0DF] text-[#201F20] transition-all shadow-xs focus-visible:outline-2 focus-visible:outline-[#2E5BFF]"
              >
                <span>Authority Access</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#494949]" />
              </Link>
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-[#201F20] hover:bg-[#F7F6F6] border border-transparent hover:border-[#E0E0DF] transition-colors focus-visible:outline-2 focus-visible:outline-[#2E5BFF]"
              aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#E0E0DF] bg-white px-6 py-6 space-y-4 animate-in slide-in-from-top-2 duration-150">
            <nav className="flex flex-col space-y-3" aria-label="Mobile Navigation">
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="text-[15px] font-medium text-[#201F20] py-1"
              >
                About
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="text-[15px] font-medium text-[#201F20] py-1"
              >
                How It Works
              </a>
              <a
                href="#stats"
                onClick={() => setMobileMenuOpen(false)}
                className="text-[15px] font-medium text-[#201F20] py-1"
              >
                Impact
              </a>
              <a
                href="#team"
                onClick={() => setMobileMenuOpen(false)}
                className="text-[15px] font-medium text-[#201F20] py-1"
              >
                Team
              </a>
            </nav>
            <div className="pt-4 border-t border-[#E0E0DF] flex flex-col gap-3">
              <Link
                href="/login"
                className="w-full text-center text-[14px] font-medium py-2.5 rounded-full border border-[#E0E0DF] text-[#201F20] bg-[#F7F6F6]"
              >
                Citizen Login
              </Link>
              <Link
                href="/desk"
                className="w-full text-center text-[14px] font-medium py-2.5 rounded-full bg-[#2E5BFF] text-white"
              >
                Authority Access
              </Link>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        {/* ══════════════════════════════════════════════════════════════
            SECTION 2 — HERO
            ══════════════════════════════════════════════════════════════ */}
        <section className="pt-16 md:pt-20 pb-16">
          <div className={styles.container}>
            {/* Context Eyebrow */}
            <div className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#606060] mb-5">
              <span className="w-2 h-2 rounded-full bg-[#2E5BFF]" />
              <span>Bengaluru Municipal Road Truth Ledger</span>
            </div>

            {/* Display Heading */}
            <h1 className="text-[36px] md:text-[48px] font-medium leading-[1.12] tracking-[-0.03em] text-[#201F20] max-w-[920px] mb-4">
              Make every civic issue count.
            </h1>

            {/* Supporting Copy */}
            <p className="text-[20px] md:text-[22px] font-normal leading-[1.35] text-[#494949] max-w-[820px] mb-3">
              Report problems. Follow the evidence. See what actually gets fixed.
            </p>

            {/* Additional Description */}
            <p className="text-[16px] font-normal leading-[1.65] text-[#606060] max-w-[680px] mb-8">
              CivicPulse connects Bengaluru residents and municipal authorities through
              location-based reporting, independent repair verification and transparent civic
              accountability.
            </p>

            {/* Primary & Secondary Action Group */}
            <div className="flex flex-wrap items-center gap-3.5 mb-6">
              <Link
                href="/citizen/report"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-[#2E5BFF] text-[#FCFCFD] text-[15px] font-medium hover:bg-[#1B47ED] transition-all transform hover:-translate-y-0.5 shadow-xs focus-visible:outline-2 focus-visible:outline-[#2E5BFF]"
              >
                <span>Explore CivicPulse</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/desk"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-[#F7F6F6] border border-[#E0E0DF] text-[#201F20] text-[15px] font-medium hover:bg-[#ECEBEB] hover:border-[#D0CFCE] transition-all focus-visible:outline-2 focus-visible:outline-[#2E5BFF]"
              >
                <span>Authority Access</span>
              </Link>
            </div>

            {/* Trust Caption */}
            <div className="inline-flex items-center gap-2 text-[13px] text-[#606060] mb-10">
              <ShieldCheck className="w-4 h-4 text-[#2E5BFF] shrink-0" />
              <span>Built around evidence, transparency and independent verification.</span>
            </div>

            {/* Full-Width Edge-To-Edge Photographic Frame */}
            <div className="relative w-full rounded-lg overflow-hidden border border-[#E0E0DF] bg-[#F7F6F6] shadow-sm">
              <div className="relative w-full h-[320px] sm:h-[420px] md:h-[480px]">
                <Image
                  src="/civic_pulse_hero.png"
                  alt="Bengaluru arterial road corridor and urban infrastructure monitoring"
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1200px) 100vw, 1200px"
                />
              </div>
              <div className="absolute bottom-4 left-4 bg-[#141314]/90 backdrop-blur-md text-[#FCFCFD] px-3.5 py-2 rounded-md font-mono text-[11px] flex items-center gap-2.5 border border-white/15 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                <span>KORAMANGALA 100 FT RD • ACTIVE VERIFICATION CYCLE</span>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 3 — ABOUT CIVICPULSE
            ══════════════════════════════════════════════════════════════ */}
        <section className="pt-20 md:pt-24 pb-16" id="about">
          <div className={styles.container}>
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#2E5BFF] mb-3">
              01 / ACCOUNTABILITY ARCHITECTURE
            </div>
            <h2 className="text-[28px] md:text-[32px] font-medium tracking-[-0.02em] leading-[1.25] text-[#201F20] mb-8 max-w-[700px]">
              More than reporting. Real accountability.
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Editorial Paragraphs */}
              <div className="space-y-5 text-[16px] leading-[1.65] text-[#494949]">
                <p>
                  Traditional civic complaint systems often depend on the department responsible for a
                  repair to confirm that the issue has been resolved. But a completion message does not
                  always prove that the work was done or that the repair lasted.
                </p>
                <p>
                  CivicPulse introduces an evidence-based approach. Citizens can report issues with
                  location and photographic evidence, authorities can manage repairs through an
                  operational system, and independent citizens can inspect claimed repairs. Follow-up
                  checks help establish whether the repair continues to hold.
                </p>
              </div>

              {/* Supporting Relationship Visual */}
              <div className="bg-[#F7F6F6] border border-[#E0E0DF] rounded-lg p-6 sm:p-7 space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-[#E0E0DF]">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.05em] text-[#201F20]">
                    Verification Lifecycle
                  </span>
                  <span className="font-mono text-[11px] font-medium px-2 py-0.5 bg-white border border-[#E0E0DF] rounded text-[#2E5BFF]">
                    Dual-Sided Truth
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3.5 p-3.5 rounded-md bg-white border border-[#E0E0DF]">
                    <div className="w-6 h-6 rounded bg-[#F0F4FF] text-[#2E5BFF] font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                      01
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-[#201F20]">
                        Cryptographic Citizen Report
                      </h3>
                      <p className="text-[12px] text-[#606060] leading-snug mt-0.5">
                        In-browser WebCrypto ECDSA P-256 signature with GPS accuracy verification (≤15 m).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5 p-3.5 rounded-md bg-white border border-[#E0E0DF]">
                    <div className="w-6 h-6 rounded bg-[#F0F4FF] text-[#2E5BFF] font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                      02
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-[#201F20]">
                        Authority Operations & Handoff
                      </h3>
                      <p className="text-[12px] text-[#606060] leading-snug mt-0.5">
                        Cross-agency routing across GBA, BWSSB, BESCOM with automated Priority Index scoring.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5 p-3.5 rounded-md bg-white border border-[#E0E0DF]">
                    <div className="w-6 h-6 rounded bg-[#F0F4FF] text-[#2E5BFF] font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                      03
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-[#201F20]">
                        Independent Citizen Re-Audit
                      </h3>
                      <p className="text-[12px] text-[#606060] leading-snug mt-0.5">
                        Blind verification at 7, 30, and 90-day intervals tracking physical repair durability.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 4 — STATS / KEY FACTS
            ══════════════════════════════════════════════════════════════ */}
        <section className="bg-[#F7F6F6] border-y border-[#E0E0DF] py-16 md:py-20" id="stats">
          <div className={styles.container}>
            <div className="mb-10">
              <div className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#606060] mb-1.5">
                02 / PLATFORM SPECIFICATIONS
              </div>
              <h2 className="text-[20px] font-semibold text-[#201F20]">System Integrity Standards</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="space-y-1.5 pr-4 border-r-0 lg:border-r border-[#E0E0DF]">
                <div className="text-[36px] md:text-[40px] font-medium tracking-[-0.03em] text-[#201F20] leading-none">
                  15 m
                </div>
                <div className="text-[14px] font-semibold text-[#494949] pt-1">
                  Spatial Duplicate Radius
                </div>
                <p className="text-[12px] text-[#606060] leading-relaxed">
                  PostGIS spatial buffer clusters nearby citizen submissions into a single issue without
                  duplicating work orders.
                </p>
              </div>

              <div className="space-y-1.5 pr-4 border-r-0 lg:border-r border-[#E0E0DF]">
                <div className="text-[36px] md:text-[40px] font-medium tracking-[-0.03em] text-[#201F20] leading-none">
                  5 min
                </div>
                <div className="text-[14px] font-semibold text-[#494949] pt-1">
                  Cryptographic Nonce Validity
                </div>
                <p className="text-[12px] text-[#606060] leading-relaxed">
                  Server-issued single-use cryptographic tokens prevent replay attacks and fabricated photo
                  submissions.
                </p>
              </div>

              <div className="space-y-1.5 pr-4 border-r-0 lg:border-r border-[#E0E0DF]">
                <div className="text-[36px] md:text-[40px] font-medium tracking-[-0.03em] text-[#201F20] leading-none">
                  7 / 30 / 90
                </div>
                <div className="text-[14px] font-semibold text-[#494949] pt-1">
                  Re-Audit Checkpoints (Days)
                </div>
                <p className="text-[12px] text-[#606060] leading-relaxed">
                  Scheduled verification cycles audit whether road patches remain intact or deteriorate
                  prematurely under traffic wear.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="text-[36px] md:text-[40px] font-medium tracking-[-0.03em] text-[#201F20] leading-none">
                  6 agencies
                </div>
                <div className="text-[14px] font-semibold text-[#494949] pt-1">
                  Integrated Public Desks
                </div>
                <p className="text-[12px] text-[#606060] leading-relaxed">
                  Unified incident routing connecting GBA, BWSSB, BESCOM, BTP, BMRCL, and BDA on one
                  append-only ledger.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 5 — GALLERY
            ══════════════════════════════════════════════════════════════ */}
        <section className="pt-20 md:pt-24 pb-16" id="how-it-works">
          <div className={styles.container}>
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#2E5BFF] mb-3">
              03 / CIVIC SUBJECT MATTER
            </div>
            <h2 className="text-[28px] md:text-[32px] font-medium tracking-[-0.02em] leading-[1.25] text-[#201F20] mb-10 max-w-[700px]">
              Monitoring urban reality across Bengaluru&apos;s arterial corridors.
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Item 1: Potholes */}
              <div className="space-y-2.5">
                <div className="relative w-full h-[220px] rounded-lg overflow-hidden border border-[#E0E0DF] bg-[#F7F6F6] group">
                  <Image
                    src="/images/placeholders/demo-evidence-potholes.jpg"
                    alt="Urban road surface conditions and potholes"
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="text-[13px] font-semibold text-[#201F20]">Road Surface Defects</div>
                <div className="text-[12px] text-[#606060]">
                  Potholes, edge degradation &amp; asphalt cratering
                </div>
              </div>

              {/* Item 2: Drainage */}
              <div className="space-y-2.5">
                <div className="relative w-full h-[220px] rounded-lg overflow-hidden border border-[#E0E0DF] bg-[#F7F6F6] group">
                  <Image
                    src="/images/placeholders/demo-evidence-drainage.jpg"
                    alt="Public drainage and stormwater infrastructure"
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="text-[13px] font-semibold text-[#201F20]">Drainage &amp; Stormwater</div>
                <div className="text-[12px] text-[#606060]">
                  Culvert blockages, drain siltation &amp; waterlogging
                </div>
              </div>

              {/* Item 3: Trench Cuts */}
              <div className="space-y-2.5">
                <div className="relative w-full h-[220px] rounded-lg overflow-hidden border border-[#E0E0DF] bg-[#F7F6F6] group">
                  <Image
                    src="/images/placeholders/demo-evidence-road_cut.jpg"
                    alt="Utility cross-trenching by municipal works"
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="text-[13px] font-semibold text-[#201F20]">Utility Trench Cuts</div>
                <div className="text-[12px] text-[#606060]">
                  Unrepaired cross-trenching by municipal utility works
                </div>
              </div>

              {/* Item 4: Streetlights */}
              <div className="space-y-2.5">
                <div className="relative w-full h-[220px] rounded-lg overflow-hidden border border-[#E0E0DF] bg-[#F7F6F6] group">
                  <Image
                    src="/images/placeholders/demo-evidence-streetlights.jpg"
                    alt="Street lighting and night roadside safety"
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="text-[13px] font-semibold text-[#201F20]">
                  Street Lighting &amp; Visibility
                </div>
                <div className="text-[12px] text-[#606060]">
                  Pole damage, luminaire outages &amp; roadside night hazards
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 6 — TEAM
            ══════════════════════════════════════════════════════════════ */}
        <section className="bg-[#F7F6F6] border-y border-[#E0E0DF] py-20 md:py-24" id="team">
          <div className={styles.container}>
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#606060] mb-3">
              04 / PROJECT STEWARDSHIP
            </div>
            <h2 className="text-[28px] md:text-[32px] font-medium tracking-[-0.02em] leading-[1.25] text-[#201F20] mb-10 max-w-[700px]">
              The people behind CivicPulse.
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Profile 1 */}
              <div className="bg-white border border-[#E0E0DF] rounded-lg p-6 flex flex-col items-center text-center gap-3.5 shadow-xs">
                <div className="w-[72px] h-[72px] rounded-full bg-[#EAEAE9] border-2 border-[#E0E0DF] flex items-center justify-center font-mono text-[18px] font-semibold text-[#494949]">
                  PL
                </div>
                <div className="space-y-0.5">
                  <div className="text-[15px] font-semibold text-[#201F20]">Project Lead</div>
                  <div className="text-[12px] font-medium text-[#2E5BFF]">
                    Civic Technology Architect
                  </div>
                </div>
                <p className="text-[12px] text-[#606060] leading-relaxed">
                  Architecting Bengaluru road truth ledger specifications and verifiable civic
                  accountability workflows.
                </p>
                <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-[#F7F6F6] border border-[#E0E0DF] text-[#606060]">
                  Project Maintainer
                </span>
              </div>

              {/* Profile 2 */}
              <div className="bg-white border border-[#E0E0DF] rounded-lg p-6 flex flex-col items-center text-center gap-3.5 shadow-xs">
                <div className="w-[72px] h-[72px] rounded-full bg-[#EAEAE9] border-2 border-[#E0E0DF] flex items-center justify-center font-mono text-[18px] font-semibold text-[#494949]">
                  SE
                </div>
                <div className="space-y-0.5">
                  <div className="text-[15px] font-semibold text-[#201F20]">Systems Engineering</div>
                  <div className="text-[12px] font-medium text-[#2E5BFF]">
                    Backend &amp; Cryptography
                  </div>
                </div>
                <p className="text-[12px] text-[#606060] leading-relaxed">
                  Lead engineer on WebCrypto P-256 evidence verification, PostGIS spatial clusters, and
                  trigger immutability.
                </p>
                <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-[#F7F6F6] border border-[#E0E0DF] text-[#606060]">
                  Core Contributor
                </span>
              </div>

              {/* Profile 3 */}
              <div className="bg-white border border-[#E0E0DF] rounded-lg p-6 flex flex-col items-center text-center gap-3.5 shadow-xs">
                <div className="w-[72px] h-[72px] rounded-full bg-[#EAEAE9] border-2 border-[#E0E0DF] flex items-center justify-center font-mono text-[18px] font-semibold text-[#494949]">
                  UI
                </div>
                <div className="space-y-0.5">
                  <div className="text-[15px] font-semibold text-[#201F20]">Interface Design</div>
                  <div className="text-[12px] font-medium text-[#2E5BFF]">
                    Product &amp; Interaction
                  </div>
                </div>
                <p className="text-[12px] text-[#606060] leading-relaxed">
                  Designing dual-sided interfaces tailored to field citizen reporting and high-density desk
                  operations.
                </p>
                <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-[#F7F6F6] border border-[#E0E0DF] text-[#606060]">
                  Core Contributor
                </span>
              </div>

              {/* Profile 4 */}
              <div className="bg-white border border-[#E0E0DF] rounded-lg p-6 flex flex-col items-center text-center gap-3.5 shadow-xs">
                <div className="w-[72px] h-[72px] rounded-full bg-[#EAEAE9] border-2 border-[#E0E0DF] flex items-center justify-center font-mono text-[18px] font-semibold text-[#494949]">
                  OP
                </div>
                <div className="space-y-0.5">
                  <div className="text-[15px] font-semibold text-[#201F20]">Field Operations</div>
                  <div className="text-[12px] font-medium text-[#2E5BFF]">
                    Municipal Coordination
                  </div>
                </div>
                <p className="text-[12px] text-[#606060] leading-relaxed">
                  Coordinating with municipal ward inspectors, agency desk officers, and civic ward
                  community groups.
                </p>
                <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-[#F7F6F6] border border-[#E0E0DF] text-[#606060]">
                  Operations Lead
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 7 — BLOG / PROJECT JOURNAL
            ══════════════════════════════════════════════════════════════ */}
        <section className="pt-20 md:pt-24 pb-16">
          <div className={styles.container}>
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#2E5BFF] mb-3">
              05 / EDITORIAL JOURNAL
            </div>
            <h2 className="text-[28px] md:text-[32px] font-medium tracking-[-0.02em] leading-[1.25] text-[#201F20] mb-10 max-w-[700px]">
              Insights from the ground.
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
              {/* Article 1 */}
              <article className="border border-[#E0E0DF] rounded-lg overflow-hidden bg-white flex flex-col hover:border-[#D0CFCE] transition-all hover:shadow-xs">
                <div className="relative w-full h-[180px] bg-[#F7F6F6]">
                  <Image
                    src="/images/placeholders/demo-evidence-potholes.jpg"
                    alt="Why a repair claim needs independent verification"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between font-mono text-[11px] text-[#606060]">
                      <span className="px-1.5 py-0.5 rounded bg-[#F0F4FF] text-[#2E5BFF] font-medium">
                        METHODOLOGY
                      </span>
                      <span>PROJECT DRAFT</span>
                    </div>
                    <h3 className="text-[17px] font-semibold text-[#201F20] leading-[1.35]">
                      Why a repair claim needs independent verification.
                    </h3>
                    <p className="text-[13px] text-[#494949] leading-relaxed">
                      Exploring the structural incentives that cause municipal contractor self-reporting to
                      diverge from actual road surface conditions.
                    </p>
                    {expandedArticle === 0 && (
                      <div className="pt-2 text-[12px] text-[#606060] bg-[#F7F6F6] p-3 rounded border border-[#E0E0DF]">
                        Contractor claim logs are often signed off remotely based on work order timestamps.
                        CivicPulse mandates blind photographic evidence from disinterested local residents
                        before updating status to Verified Fixed.
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-[#E0E0DF] flex items-center justify-between">
                    <span className="text-[11px] text-[#606060]">CivicPulse Research</span>
                    <button
                      type="button"
                      onClick={() => toggleArticle(0)}
                      className="text-[13px] font-medium text-[#2E5BFF] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{expandedArticle === 0 ? 'Close note' : 'Read abstract'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>

              {/* Article 2 */}
              <article className="border border-[#E0E0DF] rounded-lg overflow-hidden bg-white flex flex-col hover:border-[#D0CFCE] transition-all hover:shadow-xs">
                <div className="relative w-full h-[180px] bg-[#F7F6F6]">
                  <Image
                    src="/images/placeholders/demo-evidence-waterlogging.jpg"
                    alt="Measuring road repair durability beyond completion"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between font-mono text-[11px] text-[#606060]">
                      <span className="px-1.5 py-0.5 rounded bg-[#F0F4FF] text-[#2E5BFF] font-medium">
                        DATA ANALYSIS
                      </span>
                      <span>PROJECT DRAFT</span>
                    </div>
                    <h3 className="text-[17px] font-semibold text-[#201F20] leading-[1.35]">
                      Measuring road repair durability beyond completion.
                    </h3>
                    <p className="text-[13px] text-[#494949] leading-relaxed">
                      How tracking 7, 30, and 90-day post-fix re-audits reveals asphalt binder failure under
                      heavy monsoon traffic.
                    </p>
                    {expandedArticle === 1 && (
                      <div className="pt-2 text-[12px] text-[#606060] bg-[#F7F6F6] p-3 rounded border border-[#E0E0DF]">
                        Analysis across arterial corridors reveals over 40% of seasonal asphalt patches
                        re-fail within 30 days due to sub-base waterlogging. Automated durability monitoring
                        flags contractor warranty obligations.
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-[#E0E0DF] flex items-center justify-between">
                    <span className="text-[11px] text-[#606060]">Durability Ledger</span>
                    <button
                      type="button"
                      onClick={() => toggleArticle(1)}
                      className="text-[13px] font-medium text-[#2E5BFF] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{expandedArticle === 1 ? 'Close note' : 'Read abstract'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>

              {/* Article 3 */}
              <article className="border border-[#E0E0DF] rounded-lg overflow-hidden bg-white flex flex-col hover:border-[#D0CFCE] transition-all hover:shadow-xs">
                <div className="relative w-full h-[180px] bg-[#F7F6F6]">
                  <Image
                    src="/images/placeholders/demo-evidence-sidewalks.jpg"
                    alt="How location-based reporting improves civic accountability"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between font-mono text-[11px] text-[#606060]">
                      <span className="px-1.5 py-0.5 rounded bg-[#F0F4FF] text-[#2E5BFF] font-medium">
                        MUNICIPAL GOV
                      </span>
                      <span>PROJECT DRAFT</span>
                    </div>
                    <h3 className="text-[17px] font-semibold text-[#201F20] leading-[1.35]">
                      How location-based reporting can improve civic accountability.
                    </h3>
                    <p className="text-[13px] text-[#494949] leading-relaxed">
                      Replacing imprecise complaint descriptions with cryptographic coordinates and corridor
                      snapping along Bengaluru&apos;s arterials.
                    </p>
                    {expandedArticle === 2 && (
                      <div className="pt-2 text-[12px] text-[#606060] bg-[#F7F6F6] p-3 rounded border border-[#E0E0DF]">
                        Text-based grievance entries create jurisdiction ambiguity between BBMP, BWSSB, and
                        BMRCL. Snapping incident coordinates to OSM road segments routes work orders directly
                        to the responsible department.
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-[#E0E0DF] flex items-center justify-between">
                    <span className="text-[11px] text-[#606060]">Urban Operations</span>
                    <button
                      type="button"
                      onClick={() => toggleArticle(2)}
                      className="text-[13px] font-medium text-[#2E5BFF] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{expandedArticle === 2 ? 'Close note' : 'Read abstract'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 8 — CLOSING CALL TO ACTION
            ══════════════════════════════════════════════════════════════ */}
        <section className="bg-[#141314] text-[#FCFCFD] py-20 md:py-24">
          <div className={styles.container}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              {/* Copy Column */}
              <div className="lg:col-span-7 space-y-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#9CA3AF]">
                  VERIFIED CIVIC ACCOUNTABILITY
                </span>
                <h2 className="text-[32px] md:text-[38px] font-medium tracking-[-0.02em] leading-[1.18] text-[#FCFCFD]">
                  Better cities begin with better accountability.
                </h2>
                <p className="text-[16px] leading-[1.65] text-[#D1D5DB] max-w-[580px]">
                  Every report creates an opportunity for action. Every independent check builds trust.
                  Help make civic improvements visible and verifiable across Greater Bengaluru.
                </p>
                <div className="flex flex-wrap items-center gap-3.5 pt-2">
                  <Link
                    href="/citizen/report"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#2E5BFF] text-white text-[14px] font-medium hover:bg-[#1B47ED] transition-colors shadow-xs"
                  >
                    <span>Explore the Platform</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/desk"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-white text-[14px] font-medium transition-colors"
                  >
                    <span>Authority Access</span>
                  </Link>
                </div>
              </div>

              {/* Live Status Card Column */}
              <div className="lg:col-span-5 bg-white/[0.04] border border-white/[0.12] rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between font-mono text-[11px] pb-3 border-b border-white/10">
                  <span className="flex items-center gap-2 text-[#10B981]">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                    BENGALURU URBAN METRO
                  </span>
                  <span className="text-[#9CA3AF]">POSTGIS 16+</span>
                </div>

                <div className="space-y-3">
                  <div className="bg-black/40 border border-white/8 rounded-md p-3.5 space-y-0.5">
                    <div className="font-mono text-[10px] uppercase text-[#9CA3AF]">
                      Cryptographic Evidence
                    </div>
                    <div className="text-[13px] text-[#E5E7EB]">
                      Hardware P-256 WebCrypto keypairs signed per report with 5-minute nonces.
                    </div>
                  </div>

                  <div className="bg-black/40 border border-white/8 rounded-md p-3.5 space-y-0.5">
                    <div className="font-mono text-[10px] uppercase text-[#9CA3AF]">
                      Immutable Ledger
                    </div>
                    <div className="text-[13px] text-[#E5E7EB]">
                      Append-only audit triggers on PostgreSQL strictly forbidding retroactive edits.
                    </div>
                  </div>

                  <div className="bg-black/40 border border-white/8 rounded-md p-3.5 space-y-0.5">
                    <div className="font-mono text-[10px] uppercase text-[#9CA3AF]">
                      Independent Verification
                    </div>
                    <div className="text-[13px] text-[#E5E7EB]">
                      Citizen re-audits confirm physical repair existence before fix certification.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 9 — FOOTER
          ══════════════════════════════════════════════════════════════ */}
      <footer className="bg-white border-t border-[#E0E0DF] pt-16 pb-10">
        <div className={styles.container}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">
            {/* Brand Column */}
            <div className="md:col-span-5 space-y-3.5">
              <Link href="#top" className="inline-flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-[#2E5BFF] flex items-center justify-center text-white font-bold text-xs">
                  CP
                </div>
                <span className="text-[18px] font-semibold text-[#201F20]">
                  CivicPulse<span className="text-[#2E5BFF]">.</span>
                </span>
              </Link>
              <p className="text-[13px] text-[#606060] leading-relaxed max-w-[340px]">
                Bengaluru municipal road truth ledger connecting residents and public authorities through
                verifiable evidence and independent repair monitoring.
              </p>
            </div>

            {/* Platform Links */}
            <div className="md:col-span-2 space-y-3">
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#201F20]">
                Platform
              </h4>
              <ul className="space-y-2 text-[13px] text-[#494949]">
                <li>
                  <Link href="/citizen/report" className="hover:text-[#2E5BFF] transition-colors">
                    Report an Issue
                  </Link>
                </li>
                <li>
                  <Link href="/citizen/map" className="hover:text-[#2E5BFF] transition-colors">
                    Corridor Map
                  </Link>
                </li>
                <li>
                  <Link href="/citizen/audit" className="hover:text-[#2E5BFF] transition-colors">
                    Citizen Re-Audit
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-[#2E5BFF] transition-colors">
                    Citizen Login
                  </Link>
                </li>
              </ul>
            </div>

            {/* Operations Links */}
            <div className="md:col-span-2 space-y-3">
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#201F20]">
                Operations
              </h4>
              <ul className="space-y-2 text-[13px] text-[#494949]">
                <li>
                  <Link href="/desk" className="hover:text-[#2E5BFF] transition-colors">
                    Operations Queue
                  </Link>
                </li>
                <li>
                  <Link href="/claim-gap" className="hover:text-[#2E5BFF] transition-colors">
                    Claim Gap Analysis
                  </Link>
                </li>
                <li>
                  <Link href="/desk/map" className="hover:text-[#2E5BFF] transition-colors">
                    Corridor Routing
                  </Link>
                </li>
                <li>
                  <Link href="/login?role=authority" className="hover:text-[#2E5BFF] transition-colors">
                    Authority Login
                  </Link>
                </li>
              </ul>
            </div>

            {/* Public Record Links */}
            <div className="md:col-span-3 space-y-3">
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#201F20]">
                Public Record
              </h4>
              <ul className="space-y-2 text-[13px] text-[#494949]">
                <li>
                  <a href="#about" className="hover:text-[#2E5BFF] transition-colors">
                    About CivicPulse
                  </a>
                </li>
                <li>
                  <a href="#stats" className="hover:text-[#2E5BFF] transition-colors">
                    Integrity Standards
                  </a>
                </li>
                <li>
                  <a href="#team" className="hover:text-[#2E5BFF] transition-colors">
                    Project Stewardship
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.openstreetmap.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-[#2E5BFF] transition-colors"
                  >
                    <span>OpenStreetMap Data</span>
                    <ExternalLink className="w-3 h-3 text-[#606060]" />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Notice */}
          <div className="pt-6 border-t border-[#E0E0DF] flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-[#606060]">
            <div>© 2026 CivicPulse • Independent Municipal Civic Technology Initiative</div>
            <div>Built for Greater Bengaluru Municipal Infrastructure</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
