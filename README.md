# ClaimGuard

> An AI-assisted consultation and record-keeping tool for small construction contractors.

## Overview

ClaimGuard is a full-stack application designed to help smaller construction contractors keep track of site events, supporting evidence, contractual obligations, and potential claims.

Smaller contractors working as part of larger construction projects may not have the same resources as major contractors or developers when it comes to monitoring contractual requirements and preparing claims. ClaimGuard aims to make this process more organised and accessible by bringing relevant project information together in one place.

The application allows users to maintain structured records of events occurring on site and associate them with supporting evidence, correspondence, and relevant contractual information. This information can then be used to identify important deadlines, surface potential contentions, and assist with drafting claims, follow-ups, and Requests for Information (RFIs).

## Key Features

- Structured recording of site events and project information
- Association of events with supporting evidence and correspondence
- Organisation of relevant contractual obligations and clauses
- Identification of important deadlines and follow-up actions
- AI-assisted analysis of project and contract information
- Assistance with drafting claims and RFIs
- Surfacing potentially important details and contentions for user review

## Technical Approach

ClaimGuard is being developed using:

- **Next.js**
- **React**
- **TypeScript**
- **OpenAI API**

A key design principle is to combine **structured application data with AI assistance**, rather than relying on an LLM to independently make contractual decisions.

Project information such as site events, evidence, correspondence, contractual clauses, and deadlines is represented in a structured form. The AI layer can then use this information as context when assisting the user.

The intended workflow is:

```text
Site Events
     │
     ├── Supporting Evidence
     │
     ├── Correspondence
     │
     └── Contractual Information
              │
              ▼
       Structured Project Data
              │
              ▼
        AI-Assisted Analysis
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
   Deadlines  Issues   Drafts
              │
              ▼
        User Review
