# DORY Quick Launcher Ranking Algorithm

## Core Formula

The ranking score for a page p at time t is given by:

\[
S(p,t) = M(q,p) \cdot \left(\frac{\alpha(t)}{\beta} \cdot \sum_{i=1}^{n} e^{-\lambda(t-t_i)} \cdot \left(1 + \ln\left(\frac{f_i}{\bar{f}}\right)\right)\right) \cdot R(p)
\]

## Components Breakdown

### 1. Time Decay
\[e^{-\lambda(t-t_i)}\]

- t = current time
- t_i = timestamp of visit i
- λ = decay constant based on visit variance:
  \[
  \lambda = \frac{1}{2\sigma^2_v}
  \]
  where σ²_v is variance of visit intervals

### 2. Frequency Normalization
\[\ln\left(\frac{f_i}{\bar{f}}\right)\]

- f_i = local frequency (visits in recent window)
- \bar{f} = mean frequency across all pages
- Log normalization prevents frequency dominance
- Handles outliers and extreme visit patterns

### 3. Adaptive Weight
\[\frac{\alpha(t)}{\beta}\]

Where α(t) is time-dependent coefficient:
\[
\alpha(t) = 1 - \frac{1}{1 + e^{-k(t-\mu)}}
\]
- μ = mean time between visits
- k = learning rate based on visit pattern stability
- β = normalization constant

### 4. Regularity Function
\[
R(p) = \frac{1}{1 + CV(I_p)} \cdot \left(1 + \frac{\text{entropy}(P_t)}{\ln(n)}\right)
\]

- CV(I_p) = coefficient of variation of inter-visit intervals
- P_t = probability distribution of visit times
- n = number of visits
- Rewards consistent visit patterns
- Normalized entropy term for pattern recognition

### 5. Match Quality
\[
M(q,p) = \gamma \cdot JW(q,p) + (1-\gamma) \cdot \text{cos}(v_q, v_p)
\]

- JW = Jaro-Winkler distance for string similarity
- v_q, v_p = vector representations of query and page
- γ adapts based on query length:
  \[
  \gamma = \frac{1}{1 + e^{-(\text{len}(q)-5)}}
  \]

## Final Score Normalization

\[
S_{final}(p,t) = \frac{S(p,t) - \min_p S(p,t)}{\max_p S(p,t) - \min_p S(p,t)}
\]

## Properties

1. **Statistical Robustness**
   - Bayesian-inspired probability handling
   - Normalized components prevent domination
   - Handles outliers through log normalization
   - Adapts to user behavior patterns

2. **Temporal Intelligence**
   - Exponential decay with adaptive rate
   - Short and long-term pattern recognition
   - Self-adjusting to usage patterns
   - Time-window sensitive

3. **Pattern Recognition**
   - Entropy-based regularity detection
   - Visit stability through coefficient of variation
   - Adaptive to user routines
   - Balanced pattern weighting

4. **Performance Considerations**
   - Pre-computable components
   - Incremental update capability
   - Cacheable intermediate values
   - Efficient real-time scoring

## Implementation Notes

1. **Component Caching**
   - Cache visit interval statistics
   - Pre-compute regularity scores
   - Store normalized frequencies
   - Update incrementally on new visits

2. **Optimization Opportunities**
   - Batch process time decay updates
   - Progressive computation of entropy
   - Lazy update of normalization factors
   - Priority queue for top results

3. **Memory-Performance Trade-offs**
   - Cache size vs recomputation
   - Update frequency vs accuracy
   - Score precision vs speed
   - Pattern storage vs detection

4. **Adaptive Parameters**
   - Self-tuning decay constant
   - Dynamic learning rate
   - Adaptive matching threshold
   - Pattern sensitivity adjustment

## Usage Example

For a page visited regularly every workday at 9am:
1. High regularity score due to consistent pattern
2. Strong time-decay score during work hours
3. Normalized frequency reflects routine usage
4. Match quality adapts to query precision

The formula will favor:
- Recently visited pages
- Regularly accessed content
- Well-matched titles/URLs
- Established usage patterns

While appropriately discounting:
- Old, abandoned pages
- Irregular, sporadic visits
- Poor query matches
- Inconsistent usage 