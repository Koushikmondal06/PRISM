"use client" 

import * as React from "react"
import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X, TrendingUp, Globe, Activity, ShieldCheck } from "lucide-react"

interface Navbar1Props {
  currentRoute?: string;
  walletButton?: React.ReactNode;
  subtitle?: string;
}

const Navbar1: React.FC<Navbar1Props> = ({ currentRoute, walletButton, subtitle }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const activeRoute = currentRoute || (typeof window !== "undefined" ? window.location.hash : "#/landing")

  const toggleMenu = () => setIsOpen(!isOpen)

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 15) {
        setScrolled(true)
      } else {
        setScrolled(false)
      }
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const navItems = [
    { label: "Home", href: "#/landing", icon: Globe },
    { label: "Markets", href: "#/markets", icon: TrendingUp },
    { label: "History", href: "#/transactions", icon: Activity },
    { label: "Admin Portal", href: "#/admin", icon: ShieldCheck },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center w-full py-4 px-4 pointer-events-none">
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={`flex items-center justify-between px-6 py-3 w-full max-w-6xl relative z-50 pointer-events-auto rounded-full transition-all duration-300 ${
          scrolled
            ? "bg-white/85 backdrop-blur-xl shadow-lg border border-[#037A6B]/20"
            : "bg-white/90 backdrop-blur-md shadow-md border border-white/60"
        }`}
        style={{
          boxShadow: scrolled
            ? "0 10px 30px -10px rgba(3, 122, 107, 0.18), 0 4px 12px rgba(0,0,0,0.05)"
            : "0 8px 24px -6px rgba(3, 122, 107, 0.12)",
        }}
      >
        {/* Brand Logo & Title */}
        <a href="#/landing" className="flex items-center space-x-3 text-decoration-none group">
          <motion.div
            className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#037A6B] to-[#05AD98] flex items-center justify-center shadow-md text-white"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            whileHover={{ rotate: 10, scale: 1.05 }}
            transition={{ duration: 0.3 }}
          >
            <TrendingUp className="w-5 h-5 text-white" />
          </motion.div>
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-none tracking-tight text-gray-900 group-hover:text-[#037A6B] transition-colors">
              PRISM
            </span>
            <span className="text-[10px] text-gray-500 font-medium tracking-wide">
              {subtitle || "Prediction Market"}
            </span>
          </div>
        </a>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-1 bg-gray-100/70 p-1 rounded-full border border-gray-200/60">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              activeRoute === item.href ||
              (item.href === "#/landing" && (activeRoute === "" || activeRoute === "#" || activeRoute === "#/"))
            return (
              <motion.div
                key={item.label}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                <a
                  href={item.href}
                  className={`flex items-center space-x-1.5 px-4 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${
                    isActive
                      ? "bg-[#037A6B] text-white shadow-sm"
                      : "text-gray-700 hover:text-[#037A6B] hover:bg-white/80"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </a>
              </motion.div>
            )
          })}
        </nav>

        {/* Desktop Wallet Button / CTA */}
        <div className="hidden md:flex items-center">
          {walletButton ? (
            <div className="prism-wallet-wrapper">{walletButton}</div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              whileHover={{ scale: 1.05 }}
            >
              <a
                href="#/markets"
                className="inline-flex items-center justify-center px-5 py-2 text-xs font-semibold text-white bg-[#037A6B] rounded-full hover:bg-[#025a4f] shadow-md transition-all"
              >
                Launch App
              </a>
            </motion.div>
          )}
        </div>

        {/* Mobile Menu Toggle Button */}
        <motion.button
          className="md:hidden flex items-center p-2 rounded-full text-gray-700 hover:bg-gray-100/80 transition-colors"
          onClick={toggleMenu}
          whileTap={{ scale: 0.9 }}
        >
          {isOpen ? <X className="h-6 w-6 text-[#037A6B]" /> : <Menu className="h-6 w-6 text-gray-800" />}
        </motion.button>
      </motion.div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-white/95 backdrop-blur-2xl z-40 pt-24 px-6 md:hidden flex flex-col justify-between pb-10 pointer-events-auto"
            initial={{ opacity: 0, y: "-100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
          >
            <div className="flex flex-col space-y-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-2 mb-2">
                Navigation
              </div>
              {navItems.map((item, i) => {
                const Icon = item.icon
                const isActive =
                  activeRoute === item.href ||
                  (item.href === "#/landing" && (activeRoute === "" || activeRoute === "#" || activeRoute === "#/"))
                return (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 + 0.1 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <a
                      href={item.href}
                      className={`flex items-center space-x-3 px-4 py-3 text-base font-semibold rounded-2xl transition-colors ${
                        isActive
                          ? "bg-[#037A6B]/10 text-[#037A6B]"
                          : "text-gray-800 hover:bg-gray-100"
                      }`}
                      onClick={toggleMenu}
                    >
                      <Icon className="w-5 h-5 text-[#037A6B]" />
                      <span>{item.label}</span>
                    </a>
                  </motion.div>
                )
              })}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                exit={{ opacity: 0, y: 20 }}
                className="pt-6 border-t border-gray-100"
              >
                {walletButton ? (
                  <div className="w-full flex justify-center" onClick={toggleMenu}>
                    {walletButton}
                  </div>
                ) : (
                  <a
                    href="#/markets"
                    className="inline-flex items-center justify-center w-full px-5 py-3 text-base font-semibold text-white bg-[#037A6B] rounded-full hover:bg-[#025a4f] shadow-lg transition-colors"
                    onClick={toggleMenu}
                  >
                    Get Started
                  </a>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

export { Navbar1 }
