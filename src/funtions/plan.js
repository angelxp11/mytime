import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../components/server/api';
import './plan.css';

const PlanModal = ({ isOpen, onClose, user, userPlan, onRequestCreated }) => {
  const [months, setMonths] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState('premium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pricePerMonth = 4000; // Precio fijo por mes
  const totalPrice = pricePerMonth * months;

  const formatCurrency = (value) => {
    return value.toLocaleString('es-CO');
  };

  if (!isOpen || !user || !userPlan) {
    return null;
  }

  const isFree = userPlan.plan !== 'premium';
  const isPremiumSelected = selectedPlan === 'premium';

  const planFeatures = [
    { label: 'Registrar Horas', premium: true, free: false },
    { label: 'Consultar Pago', premium: true, free: false },
    { label: 'Compartir Horario', premium: true, free: true },
    { label: 'Recuperar Datos', premium: true, free: true },
    { label: 'Historial completo', premium: true, free: false },
    { label: 'Soporte prioritario', premium: true, free: false },
  ];

  const handleRequestRenewal = async () => {
    if (!isFree) {
      onClose();
      return;
    }

    const whatsappMessage = 'Hola ya adquirí mi plan premium en MyTime, te envío el comprobante de pago';
    const whatsappUrl = `https://wa.me/573054715845?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(whatsappUrl, '_blank');

    setIsSubmitting(true);
    try {
      const request = {
        status: 'pending',
        months,
        price: totalPrice,
        requestedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'usuarios', user.uid), {
        planRequest: request,
        plan: 'free',
        membresia: false,
      }, { merge: true });

      onRequestCreated?.(request);
      alert('Solicitud de renovación enviada. Se abrirá WhatsApp para enviar el comprobante.');
      onClose();
    } catch (error) {
      console.error('Error enviando solicitud de renovación:', error);
      alert('Error al enviar la solicitud. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="plan-modal-overlay">
      <div className="plan-modal-content">
        <div className="plan-modal-header">
          <div>
            <h2>{isFree ? 'Elige tu plan' : 'Tu plan Premium'}</h2>
            <p className="plan-modal-subtitle">
              {isFree
                ? 'Selecciona entre Free y Premium para desbloquear todas las funciones de MyTime.'
                : 'Tu plan premium está activo. Gracias por usar MyTime.'}
            </p>
          </div>
          <button className="plan-close-button" onClick={onClose}>×</button>
        </div>

        <div className="plan-modal-body">
          <div className="plan-info-card">
            <div className="plan-label-row">
              <span className="plan-label">Plan actual:</span>
              <span className={`plan-status ${isFree ? 'free' : 'premium'}`}>
                {isFree ? 'FREE' : 'PREMIUM'}
              </span>
            </div>
          </div>

          <div className="plan-cards-grid">
            <div className={`plan-card free-card ${selectedPlan === 'free' ? 'selected' : ''}`}>
              <div className="plan-card-header">
                <div>
                  <h3>Free</h3>
                  <p>Gratis</p>
                </div>
                <span className="plan-card-badge">Incluido</span>
              </div>
              <div className="plan-card-price">$0</div>
              <ul className="plan-features">
                {planFeatures.map((feature) => (
                  <li
                    key={feature.label}
                    className={`plan-feature ${feature.free ? 'available' : 'unavailable'}`}
                  >
                    <span className={`plan-feature-icon ${feature.free ? 'available' : 'unavailable'}`}>
                      {feature.free ? '✓' : '×'}
                    </span>
                    {feature.label}
                  </li>
                ))}
              </ul>
              <div className="plan-card-footer">
                <button
                  type="button"
                  className={`plan-select-button ${selectedPlan === 'free' ? 'selected' : ''}`}
                  onClick={() => setSelectedPlan('free')}
                >
                  {selectedPlan === 'free' ? 'Seleccionado' : 'Seleccionar'}
                </button>
              </div>
            </div>

            <div className={`plan-card premium-card ${selectedPlan === 'premium' ? 'selected' : ''}`}>
              <div className="plan-card-header">
                <div>
                  <h3>Premium</h3>
                  <p>Desde</p>
                </div>
                <span className="plan-card-badge premium-badge">Recomendado</span>
              </div>
              <div className="plan-card-price">$ {formatCurrency(pricePerMonth)} / mes</div>
              <ul className="plan-features">
                {planFeatures.map((feature) => (
                  <li key={feature.label} className="plan-feature available">
                    <span className="plan-feature-icon available">✓</span>
                    {feature.label}
                  </li>
                ))}
              </ul>
              <div className="plan-card-footer">
                <button
                  type="button"
                  className={`plan-select-button ${selectedPlan === 'premium' ? 'selected' : ''}`}
                  onClick={() => setSelectedPlan('premium')}
                >
                  {selectedPlan === 'premium' ? 'Seleccionado' : 'Seleccionar'}
                </button>
              </div>
            </div>
          </div>

          {isFree && selectedPlan === 'premium' && selectedPlan === 'premium' && (
            <div className="plan-payment-section">
              <div className="plan-price-row">
                <span>Precio por mes:</span>
                <strong>$ {formatCurrency(pricePerMonth)}</strong>
              </div>
              <div className="plan-months-row">
                <label htmlFor="plan-months">Meses a solicitar:</label>
                <select
                  id="plan-months"
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                >
                  {[1, 2, 3, 6, 12].map((value) => (
                    <option key={value} value={value}>{value} mes{value > 1 ? 'es' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="plan-price-row">
                <span>Total a pagar:</span>
                <strong>$ {formatCurrency(totalPrice)}</strong>
              </div>
              <div className="plan-instructions">
                <p>Instrucciones:</p>
                <ol>
                  <li>Escanea el código QR con el banco deseado.</li>
                  <li>Ingresa el valor correspondiente $ {formatCurrency(totalPrice)}.</li>
                  <li>Haz clic en "Solicitar Premium" para enviar la solicitud.</li>
                </ol>
              </div>
              <div className="plan-qr-section">
                <img
                  src="https://spidibot.online/static/media/qrpago.94d48dfe9dd549188d0f.png"
                  alt="QR de pago"
                  className="plan-qr"
                />
              </div>
              <div className="plan-payment-action">
                <button className="plan-request-button" onClick={handleRequestRenewal} disabled={isSubmitting}>
                  {isSubmitting ? 'Enviando...' : 'Solicitar Premium'}
                </button>
              </div>
            </div>
          )}
          {isFree && selectedPlan === 'free' && (
            <div className="plan-payment-section plan-free-selection-note">
              <p>Has seleccionado el plan Free. Para desbloquear Consultar Pago y Registro de Horas selecciona Premium.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanModal;
