import React, { useEffect, useRef } from 'react';
import { PitchInfo } from '../hooks/useVocalTuner';

interface VocalTunerCanvasProps {
  userPitch: PitchInfo | null;
  targetPitch: PitchInfo | null;
  streakCount?: number;
  width?: number;
  height?: number;
}

export const VocalTunerCanvas: React.FC<VocalTunerCanvasProps> = ({
  userPitch,
  targetPitch,
  streakCount = 0,
  width = 460,
  height = 270
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentAngleRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let centsOffset = userPitch ? userPitch.cents : 0;
    
    if (userPitch && targetPitch && targetPitch.frequency > 0) {
      const centsDiff = 1200 * (Math.log(userPitch.frequency / targetPitch.frequency) / Math.log(2));
      centsOffset = Math.max(-50, Math.min(50, centsDiff));
    }

    const targetAngle = (centsOffset * (Math.PI / 180) * 45) / 50;

    currentAngleRef.current += (targetAngle - currentAngleRef.current) * 0.2;

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height - 45;
    const radius = 185;

    const absCents = Math.abs(centsOffset);
    const inTolerance = userPitch && absCents <= 15;
    const perfectPitch = userPitch && absCents <= 8;

    // 1. Positive Validation Background Flash
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI);
    ctx.fillStyle = userPitch && (perfectPitch || inTolerance) ? 'rgba(236, 253, 245, 0.95)' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = userPitch && (perfectPitch || inTolerance) ? '#10b981' : '#e2e8f0';
    ctx.stroke();

    // 2. Tolerance Arc (Clean & Encouraging)
    // Left Zone (Too Low)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 15, Math.PI * 1.25, Math.PI * 1.42);
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#fca5a5'; // Soft friendly red
    ctx.stroke();

    // Positive Target Green Zone
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 15, Math.PI * 1.42, Math.PI * 1.58);
    ctx.lineWidth = inTolerance ? 20 : 14;
    ctx.strokeStyle = '#10b981';
    if (inTolerance) {
      ctx.shadowColor = 'rgba(16, 185, 129, 0.5)';
      ctx.shadowBlur = 16;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Right Zone (Too High)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 15, Math.PI * 1.58, Math.PI * 1.75);
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#fca5a5';
    ctx.stroke();

    // 3. Simple Guidance Text (Hiding complex Hz / cents numbers)
    ctx.textAlign = 'center';

    // Target Note Display
    ctx.fillStyle = userPitch ? (inTolerance ? '#10b981' : '#0f172a') : '#94a3b8';
    ctx.font = 'bold 42px Outfit, sans-serif';
    const noteText = userPitch ? `${userPitch.note}${userPitch.octave}` : targetPitch ? `${targetPitch.note}${targetPitch.octave}` : '--';
    ctx.fillText(noteText, centerX, centerY - 76);

    // Simple Actionable Pitch Guidance Text
    ctx.font = 'bold 15px Outfit, sans-serif';
    if (userPitch) {
      if (perfectPitch || inTolerance) {
        ctx.fillStyle = '#10b981';
        ctx.fillText('🌟 EXCELENTE! VOCÊ NA AFINAÇÃO CERTA', centerX, centerY - 48);
      } else if (centsOffset < 0) {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('⬆️ CANTE MAIS AGUDO', centerX, centerY - 48);
      } else {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('⬇️ CANTE MAIS GRAVE', centerX, centerY - 48);
      }
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('Cante no microfone para alinhar com a voz...', centerX, centerY - 48);
    }

    // 4. Positive Continuous Streak Counter Badge
    if (streakCount > 0) {
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 13px Outfit, sans-serif';
      ctx.fillText(`🔥 ${streakCount} acertos contínuos!`, centerX, centerY - 24);
    }

    // 5. Directional Needle
    const needleAngle = Math.PI * 1.5 + currentAngleRef.current;
    const needleLength = radius - 25;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    const needleX = centerX + needleLength * Math.cos(needleAngle);
    const needleY = centerY + needleLength * Math.sin(needleAngle);
    ctx.lineTo(needleX, needleY);
    
    ctx.lineWidth = 4;
    ctx.strokeStyle = userPitch ? (inTolerance ? '#10b981' : '#ef4444') : '#cbd5e1';
    if (userPitch && inTolerance) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 15;
    }
    ctx.stroke();
    ctx.restore();

    // 6. Center Pivot
    ctx.beginPath();
    ctx.arc(centerX, centerY, 10, 0, 2 * Math.PI);
    ctx.fillStyle = userPitch ? (inTolerance ? '#10b981' : '#ef4444') : '#94a3b8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

  }, [userPitch, targetPitch, streakCount, width, height]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '1rem 0' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          borderRadius: '24px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 30px rgba(0,0,0,0.04)'
        }}
      />
    </div>
  );
};
