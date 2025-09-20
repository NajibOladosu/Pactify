-- Atomic Payment Processing Functions
-- These functions ensure payment operations are atomic and prevent race conditions

-- Function to atomically process escrow payment
CREATE OR REPLACE FUNCTION process_escrow_payment_atomic(
  p_contract_id UUID,
  p_payment_intent_id TEXT,
  p_buyer_user_id UUID,
  p_payee_account_id TEXT,
  p_amount INTEGER,
  p_currency TEXT DEFAULT 'usd',
  p_platform_fee INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract contracts%ROWTYPE;
  v_existing_payment escrow_ledger%ROWTYPE;
  v_ledger_entry escrow_ledger%ROWTYPE;
  v_result JSONB;
BEGIN
  -- Lock the contract to prevent concurrent modifications
  SELECT * INTO v_contract 
  FROM contracts 
  WHERE id = p_contract_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CONTRACT_NOT_FOUND',
      'message', 'Contract not found'
    );
  END IF;
  
  -- Check if payment already exists (idempotency)
  SELECT * INTO v_existing_payment
  FROM escrow_ledger
  WHERE payment_intent_id = p_payment_intent_id;
  
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'existing', true,
      'ledger_id', v_existing_payment.id,
      'status', v_existing_payment.status
    );
  END IF;
  
  -- Validate contract state
  IF v_contract.status NOT IN ('draft', 'signed', 'pending_funding') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CONTRACT_STATE',
      'message', 'Contract cannot be funded in current state: ' || v_contract.status
    );
  END IF;
  
  -- Validate user authorization
  IF v_contract.client_id != p_buyer_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'User not authorized to fund this contract'
    );
  END IF;
  
  -- Create escrow ledger entry
  INSERT INTO escrow_ledger (
    payment_intent_id,
    buyer_user_id,
    payee_account_id,
    amount,
    currency,
    platform_fee,
    status,
    contract_id,
    description,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    p_payment_intent_id,
    p_buyer_user_id,
    p_payee_account_id,
    p_amount,
    p_currency,
    p_platform_fee,
    'held',
    p_contract_id,
    'Escrow funding for contract ' || v_contract.contract_number,
    p_metadata,
    NOW(),
    NOW()
  ) RETURNING * INTO v_ledger_entry;
  
  -- Update contract status
  UPDATE contracts 
  SET 
    status = 'funded',
    funded_at = NOW(),
    updated_at = NOW()
  WHERE id = p_contract_id;
  
  -- Log the transaction
  INSERT INTO audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    created_at
  ) VALUES (
    p_buyer_user_id,
    'escrow_payment_created',
    'escrow_ledger',
    v_ledger_entry.id,
    jsonb_build_object(
      'contract_id', p_contract_id,
      'amount', p_amount,
      'currency', p_currency,
      'payment_intent_id', p_payment_intent_id
    ),
    NOW()
  );
  
  -- Return success result
  RETURN jsonb_build_object(
    'success', true,
    'ledger_id', v_ledger_entry.id,
    'status', v_ledger_entry.status,
    'amount', v_ledger_entry.amount,
    'currency', v_ledger_entry.currency,
    'contract_status', 'funded'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error
    INSERT INTO audit_logs (
      user_id,
      action,
      resource_type,
      resource_id,
      details,
      created_at
    ) VALUES (
      p_buyer_user_id,
      'escrow_payment_error',
      'escrow_ledger',
      NULL,
      jsonb_build_object(
        'error', SQLERRM,
        'contract_id', p_contract_id,
        'payment_intent_id', p_payment_intent_id
      ),
      NOW()
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TRANSACTION_FAILED',
      'message', 'Payment processing failed: ' || SQLERRM
    );
END;
$$;

-- Function to atomically release escrow payment
CREATE OR REPLACE FUNCTION release_escrow_payment_atomic(
  p_ledger_id UUID,
  p_releasing_user_id UUID,
  p_transfer_id TEXT DEFAULT NULL,
  p_release_amount INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ledger escrow_ledger%ROWTYPE;
  v_contract contracts%ROWTYPE;
  v_release_amount INTEGER;
  v_result JSONB;
BEGIN
  -- Lock the ledger entry
  SELECT * INTO v_ledger
  FROM escrow_ledger
  WHERE id = p_ledger_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'LEDGER_NOT_FOUND',
      'message', 'Escrow ledger entry not found'
    );
  END IF;
  
  -- Get contract details
  SELECT * INTO v_contract
  FROM contracts
  WHERE id = v_ledger.contract_id;
  
  -- Validate current status
  IF v_ledger.status NOT IN ('held', 'partial_released') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'Cannot release payment in status: ' || v_ledger.status
    );
  END IF;
  
  -- Validate user authorization (client or admin)
  IF v_contract.client_id != p_releasing_user_id THEN
    -- Check if user is admin (you may need to implement admin role check)
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'User not authorized to release this payment'
    );
  END IF;
  
  -- Determine release amount
  v_release_amount := COALESCE(p_release_amount, (v_ledger.amount - COALESCE(v_ledger.released_amount, 0)));
  
  -- Validate release amount
  IF v_release_amount <= 0 OR (v_ledger.released_amount + v_release_amount) > v_ledger.amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_AMOUNT',
      'message', 'Invalid release amount'
    );
  END IF;
  
  -- Update ledger entry
  UPDATE escrow_ledger
  SET
    status = CASE 
      WHEN (released_amount + v_release_amount) >= amount THEN 'released'
      ELSE 'partial_released'
    END,
    released_amount = COALESCE(released_amount, 0) + v_release_amount,
    release_transfer_id = p_transfer_id,
    released_at = CASE 
      WHEN (released_amount + v_release_amount) >= amount THEN NOW()
      ELSE released_at
    END,
    updated_at = NOW()
  WHERE id = p_ledger_id;
  
  -- Update contract status if fully released
  IF (v_ledger.released_amount + v_release_amount) >= v_ledger.amount THEN
    UPDATE contracts
    SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = v_ledger.contract_id;
  END IF;
  
  -- Log the transaction
  INSERT INTO audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    created_at
  ) VALUES (
    p_releasing_user_id,
    'escrow_payment_released',
    'escrow_ledger',
    p_ledger_id,
    jsonb_build_object(
      'release_amount', v_release_amount,
      'total_released', v_ledger.released_amount + v_release_amount,
      'transfer_id', p_transfer_id,
      'contract_id', v_ledger.contract_id
    ),
    NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'released_amount', v_release_amount,
    'total_released', v_ledger.released_amount + v_release_amount,
    'remaining_amount', v_ledger.amount - (v_ledger.released_amount + v_release_amount),
    'status', CASE 
      WHEN (v_ledger.released_amount + v_release_amount) >= v_ledger.amount THEN 'released'
      ELSE 'partial_released'
    END
  );
  
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO audit_logs (
      user_id,
      action,
      resource_type,
      resource_id,
      details,
      created_at
    ) VALUES (
      p_releasing_user_id,
      'escrow_release_error',
      'escrow_ledger',
      p_ledger_id,
      jsonb_build_object(
        'error', SQLERRM,
        'release_amount', v_release_amount
      ),
      NOW()
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RELEASE_FAILED',
      'message', 'Payment release failed: ' || SQLERRM
    );
END;
$$;

-- Function to atomically refund escrow payment
CREATE OR REPLACE FUNCTION refund_escrow_payment_atomic(
  p_ledger_id UUID,
  p_refunding_user_id UUID,
  p_refund_amount INTEGER DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ledger escrow_ledger%ROWTYPE;
  v_contract contracts%ROWTYPE;
  v_refund_amount INTEGER;
BEGIN
  -- Lock the ledger entry
  SELECT * INTO v_ledger
  FROM escrow_ledger
  WHERE id = p_ledger_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'LEDGER_NOT_FOUND'
    );
  END IF;
  
  -- Get contract
  SELECT * INTO v_contract
  FROM contracts
  WHERE id = v_ledger.contract_id;
  
  -- Validate refund eligibility
  IF v_ledger.status NOT IN ('held', 'partial_released') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CANNOT_REFUND_STATUS',
      'message', 'Cannot refund payment in status: ' || v_ledger.status
    );
  END IF;
  
  -- Calculate refundable amount
  v_refund_amount := COALESCE(p_refund_amount, 
    v_ledger.amount - COALESCE(v_ledger.released_amount, 0) - COALESCE(v_ledger.refunded_amount, 0)
  );
  
  -- Validate refund amount
  IF v_refund_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NO_REFUNDABLE_AMOUNT'
    );
  END IF;
  
  -- Update ledger
  UPDATE escrow_ledger
  SET
    status = 'refunded',
    refunded_amount = COALESCE(refunded_amount, 0) + v_refund_amount,
    refunded_at = NOW(),
    updated_at = NOW()
  WHERE id = p_ledger_id;
  
  -- Update contract status
  UPDATE contracts
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE id = v_ledger.contract_id;
  
  -- Log refund
  INSERT INTO audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    created_at
  ) VALUES (
    p_refunding_user_id,
    'escrow_payment_refunded',
    'escrow_ledger',
    p_ledger_id,
    jsonb_build_object(
      'refund_amount', v_refund_amount,
      'reason', p_reason,
      'contract_id', v_ledger.contract_id
    ),
    NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'refunded_amount', v_refund_amount,
    'status', 'refunded'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REFUND_FAILED',
      'message', SQLERRM
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION process_escrow_payment_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION release_escrow_payment_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION refund_escrow_payment_atomic TO authenticated;