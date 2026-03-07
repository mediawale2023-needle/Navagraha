import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export default function Splash() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => {
      setLocation('/');
    }, 3000);

    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0D0D0D]">
      {/* Celestial background effects */}
      <div className="absolute inset-0 celestial-bg" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(233,30,140,0.15) 0%, transparent 70%)' }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 text-center"
      >
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          className="inline-block mb-6"
        >
          <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center glow-pink">
            <Sparkles className="w-12 h-12 text-white" />
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-6xl md:text-7xl font-semibold text-white mb-4"
        >
          Navagraha
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="text-xl text-gray-400 font-light"
        >
          Your Personal Vedic Astrology Guide
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="mt-8 flex justify-center gap-2"
        >
          <div className="w-2 h-2 rounded-full gradient-primary animate-pulse" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full gradient-primary animate-pulse" style={{ animationDelay: '200ms' }} />
          <div className="w-2 h-2 rounded-full gradient-primary animate-pulse" style={{ animationDelay: '400ms' }} />
        </motion.div>
      </motion.div>
    </div>
  );
}
