# VTUCalc: Technical Documentation & Framework Overview

This document outlines the architecture, frameworks, and technologies used to build the **VTU CGPA Calculator**. The system is designed for high performance, privacy, and industry-standard scalability.

## 🚀 1. Core Framework: Next.js 14
We used **Next.js 14** as the foundation. It provides the following advantages for this system:
- **React 18**: Powers the dynamic and responsive user interface.
- **App Router**: Enables high-performance server-side rendering (SSR) and modern routing.
- **Serverless API Routes**: Used for handling heavy tasks like PDF parsing without requiring a dedicated backend server.

## 🎨 2. Styling: Vanilla CSS (Custom Design System)
Instead of generic UI libraries, we built a **Custom Design System** from scratch using **Modern CSS**:
- **Glassmorphism**: High-end UI effects with `backdrop-filter` and transparency.
- **Responsive Layout**: Fluid grid systems and media queries for mobile-to-desktop compatibility.
- **CSS Variables**: A centralized color system for consistent branding and performance-grade performance.
- **Animations**: native CSS `@keyframes` for smooth, high-frame-rate transitions.

## 📄 3. PDF Engine: Python Bridge (Hybrid Architecture)
To handle the "Upload" feature, we now use a hybrid **Node.js + Python** architecture:
- **Python Integration**: Next.js spawns a Python child process using `pdfplumber` and `pypdf`.
- **Advanced Table Detection**: Python's `pdfplumber` allows for precise extraction of structured grades and subject tables, which is significantly more accurate than standard text parsers.
- **Node.js Bridge**: The results are passed back to the Next.js API in JSON format, ensuring a seamless experience for the user.
- **Heuristic Parsing**: Custom Python logic identifies USN, Scheme, and Semester data with high reliability.

## 🧮 4. Business Logic: Native Javascript (ES6+)
The core grading logic resides in `lib/vtuGrades.js`:
- **Functional Architecture**: Pure functions calculate SGPA, CGPA, and Percentages for 2018, 2021, 2022, and 2024 schemes.
- **Scheme Mapping**: A centralized object containing all VTU grading rules, making it easily extendable for future schemes.

## 🛡️ 5. Security & Privacy
- **Client-Side Heavy**: 99% of calculations happen in the browser, meaning student data NEVER touches a database.
- **Stateless APIs**: The PDF parsing API does not store any files; it processes the buffer in memory and returns the JSON result instantly.

## 📦 6. Deployment & Dev Tools
- **NPM/Node.js**: Package management and development environment.
- **ESLint**: Ensures code quality and production-grade standards.
- **Vercel Ready**: Optimized for instant deployment with edge-caching and global distribution.

---
**VTUCalc** is built to be a production-ready utility for students, blending speed with modern web aesthetics.
