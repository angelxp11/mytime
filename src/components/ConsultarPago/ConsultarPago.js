import React from 'react';
import '../../colors.css';
import './ConsultarPago.css';

const ConsultarPago = () => {
  // Mock data for payments
  const payments = [
    { id: 1, amount: 500, date: '2023-10-01', status: 'Pagado' },
    { id: 2, amount: 300, date: '2023-09-15', status: 'Pendiente' },
  ];

  return (
    <div className="pago-container">
      <h2>Consultar Pago</h2>
      <div className="pago-list">
        {payments.map(payment => (
          <div key={payment.id} className="pago-card">
            <p>Monto: ${payment.amount}</p>
            <p>Fecha: {payment.date}</p>
            <p>Estado: {payment.status}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConsultarPago;