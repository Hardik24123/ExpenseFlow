def minimize_transactions(balances):
    """
    Takes a dictionary of net balances and returns a list of optimized transactions.
    Example Input: {'user_A': -500, 'user_B': 200, 'user_C': 300}
    """
    debtors = []
    creditors = []
    
    # Separate users into those who owe money (-) and those who are owed money (+)
    for uid, amount in balances.items():
        if amount < -0.01: # Use 0.01 to avoid floating point math weirdness
            debtors.append({'uid': uid, 'amount': abs(amount)})
        elif amount > 0.01:
            creditors.append({'uid': uid, 'amount': amount})
            
    # Sort them from largest amounts to smallest to optimize the matching
    debtors.sort(key=lambda x: x['amount'], reverse=True)
    creditors.sort(key=lambda x: x['amount'], reverse=True)
    
    transactions = []
    i = 0 # Debtors index
    j = 0 # Creditors index
    
    # Greedily match the highest debtors with the highest creditors
    while i < len(debtors) and j < len(creditors):
        debtor = debtors[i]
        creditor = creditors[j]
        
        # The transaction amount is the smaller of the two balances
        settle_amount = min(debtor['amount'], creditor['amount'])
        
        transactions.append({
            'from': debtor['uid'],
            'to': creditor['uid'],
            'amount': round(settle_amount, 2)
        })
        
        # Deduct the settled amount from both
        debtor['amount'] -= settle_amount
        creditor['amount'] -= settle_amount
        
        # Move to the next person if their balance is cleared
        if debtor['amount'] < 0.01:
            i += 1
        if creditor['amount'] < 0.01:
            j += 1
            
    return transactions