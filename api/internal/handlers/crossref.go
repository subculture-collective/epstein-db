package handlers

import (
	"context"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/subculture-collective/epstein-db/api/internal/db"
)

// SearchPPP searches PPP loan data
func SearchPPP(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	query := c.Query("q", "")
	limitStr := c.Query("limit", "50")
	limit, _ := strconv.Atoi(limitStr)
	if limit > 200 {
		limit = 200
	}

	rows, err := pool.Query(ctx, `
		SELECT id, borrower_name, borrower_city, borrower_state, 
			   loan_amount, forgiveness_amount, lender, date_approved,
			   similarity(borrower_name, $1) AS score
		FROM ppp_loans
		WHERE $1 = '' OR borrower_name % $1 OR borrower_name ILIKE '%' || $1 || '%'
		ORDER BY 
			CASE WHEN $1 != '' THEN similarity(borrower_name, $1) ELSE 0 END DESC,
			loan_amount DESC NULLS LAST
		LIMIT $2
	`, query, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var results []fiber.Map
	for rows.Next() {
		var id int
		var name string
		var city, state, lender *string
		var loanAmount, forgivenessAmount *float64
		var dateApproved *string
		var score float64

		if err := rows.Scan(&id, &name, &city, &state, &loanAmount, 
			&forgivenessAmount, &lender, &dateApproved, &score); err != nil {
			continue
		}

		results = append(results, fiber.Map{
			"id":                id,
			"borrowerName":      name,
			"borrowerCity":      city,
			"borrowerState":     state,
			"loanAmount":        loanAmount,
			"forgivenessAmount": forgivenessAmount,
			"lender":            lender,
			"dateApproved":      dateApproved,
			"matchScore":        score,
		})
	}

	return c.JSON(fiber.Map{
		"results": results,
		"count":   len(results),
	})
}

// SearchFEC searches FEC contribution data
func SearchFEC(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	query := c.Query("q", "")
	candidate := c.Query("candidate", "")
	limitStr := c.Query("limit", "50")
	limit, _ := strconv.Atoi(limitStr)
	if limit > 200 {
		limit = 200
	}

	rows, err := pool.Query(ctx, `
		SELECT id, contributor_name, contributor_city, contributor_state,
			   contributor_employer, contributor_occupation,
			   candidate_name, committee_name, amount, contribution_date,
			   similarity(contributor_name, $1) AS score
		FROM fec_contributions
		WHERE ($1 = '' OR contributor_name % $1 OR contributor_name ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR candidate_name ILIKE '%' || $2 || '%')
		ORDER BY 
			CASE WHEN $1 != '' THEN similarity(contributor_name, $1) ELSE 0 END DESC,
			amount DESC NULLS LAST
		LIMIT $3
	`, query, candidate, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var results []fiber.Map
	for rows.Next() {
		var id int
		var name string
		var city, state, employer, occupation, candidateName, committeeName *string
		var amount *float64
		var contributionDate *string
		var score float64

		if err := rows.Scan(&id, &name, &city, &state, &employer, &occupation,
			&candidateName, &committeeName, &amount, &contributionDate, &score); err != nil {
			continue
		}

		results = append(results, fiber.Map{
			"id":              id,
			"contributorName": name,
			"contributorCity": city,
			"contributorState": state,
			"employer":         employer,
			"occupation":       occupation,
			"candidateName":    candidateName,
			"committeeName":    committeeName,
			"amount":           amount,
			"contributionDate": contributionDate,
			"matchScore":       score,
		})
	}

	return c.JSON(fiber.Map{
		"results": results,
		"count":   len(results),
	})
}

// SearchGrants searches federal grants data
func SearchGrants(c *fiber.Ctx) error {
	ctx := context.Background()
	pool := db.Pool()

	query := c.Query("q", "")
	agency := c.Query("agency", "")
	limitStr := c.Query("limit", "50")
	limit, _ := strconv.Atoi(limitStr)
	if limit > 200 {
		limit = 200
	}

	rows, err := pool.Query(ctx, `
		SELECT id, recipient_name, recipient_city, recipient_state,
			   awarding_agency, funding_agency, award_amount, award_date,
			   description, cfda_title,
			   similarity(recipient_name, $1) AS score
		FROM federal_grants
		WHERE ($1 = '' OR recipient_name % $1 OR recipient_name ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR awarding_agency ILIKE '%' || $2 || '%')
		ORDER BY 
			CASE WHEN $1 != '' THEN similarity(recipient_name, $1) ELSE 0 END DESC,
			award_amount DESC NULLS LAST
		LIMIT $3
	`, query, agency, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var results []fiber.Map
	for rows.Next() {
		var id int
		var name string
		var city, state, awardingAgency, fundingAgency *string
		var awardAmount *float64
		var awardDate, description, cfdaTitle *string
		var score float64

		if err := rows.Scan(&id, &name, &city, &state, &awardingAgency, &fundingAgency,
			&awardAmount, &awardDate, &description, &cfdaTitle, &score); err != nil {
			continue
		}

		results = append(results, fiber.Map{
			"id":             id,
			"recipientName":  name,
			"recipientCity":  city,
			"recipientState": state,
			"awardingAgency": awardingAgency,
			"fundingAgency":  fundingAgency,
			"awardAmount":    awardAmount,
			"awardDate":      awardDate,
			"description":    description,
			"cfdaTitle":      cfdaTitle,
			"matchScore":     score,
		})
	}

	return c.JSON(fiber.Map{
		"results": results,
		"count":   len(results),
	})
}
